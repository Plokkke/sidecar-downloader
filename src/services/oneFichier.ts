import { Readable } from 'stream';

import { Logger, NotFoundException } from '@nestjs/common';
import axios, { AxiosError, AxiosResponse } from 'axios';
import { z } from 'zod';

import { DownloadInfos, DownloadItem } from '@/schemas/DownloadItem';
import { ArchiveExtractorService } from '@/services/archive-extractor';
import { DownloadService } from '@/services/download';
import { DownloadEventEmitter } from '@/services/download-events';

export const oneFichierConfigSchema = z.object({
  host: z.string().trim().min(1),
  apiKey: z.string().trim().min(1).optional(),
});

export type OneFichierConfig = z.infer<typeof oneFichierConfigSchema>;

const WEB_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/48.0.2564.103 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-us,en;q=0.5',
  Cookie: 'LG=en',
};

const FREE_DOWNLOAD_WAIT_MS = 2000;

export class OneFichierError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'OneFichierError';
  }
}

function getFileName(response: AxiosResponse): string {
  const contentDisposition = response.headers['content-disposition'];
  if (!contentDisposition) {
    return '';
  }
  const match = contentDisposition.match(/filename="?([^";]+)"?/);
  return match ? match[1] : '';
}

function getContentLength(response: AxiosResponse): number | null {
  const length = response.headers['content-length'];
  return length ? parseInt(length, 10) : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detectErrors(html: string): void {
  if (/File not found/i.test(html) || /NOT FOUND/i.test(html) || /BAD LINK/i.test(html)) {
    throw new NotFoundException('File not found on 1fichier');
  }

  if (/IP Locked/i.test(html)) {
    throw new OneFichierError('IP locked by 1fichier', 60 * 60 * 1000);
  }

  const waitMatch = html.match(/You must wait (?:at least|up to)\s*(\d+)\s*minutes/i);
  if (waitMatch) {
    const waitMinutes = parseInt(waitMatch[1], 10);
    throw new OneFichierError(`Must wait ${waitMinutes} minutes`, waitMinutes * 60 * 1000);
  }

  if (/Your requests are too fast/i.test(html)) {
    throw new OneFichierError('Requests too fast, slow down', 30 * 1000);
  }

  if (/You already download/i.test(html) || /download only one file at a time/i.test(html)) {
    throw new OneFichierError('Concurrent download limit reached', 30 * 1000);
  }

  if (/Access to this file is protected/i.test(html) || /PRIVATE/i.test(html)) {
    throw new OneFichierError('File is private or access restricted');
  }

  if (/too many connections/i.test(html) || /massively shared/i.test(html)) {
    throw new OneFichierError('Too many connections detected', 5 * 60 * 1000);
  }
}

function extractDownloadLink(html: string): string | null {
  const patterns = [
    /<a\s+href="(https?:\/\/[^"]+)"[^>]*>.*?Click here to download/is,
    /window\.location\s*=\s*['"]?(https?:\/\/[^'";\s]+)/i,
    /align:middle">\s*<a\s+href=['"]?(https?:\/\/[^'";\s]+)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

export class OneFichierDownloadService extends DownloadService {
  protected logger: Logger = new Logger(OneFichierDownloadService.name);

  private get isPremium(): boolean {
    return !!this.oneFichierConfig.apiKey;
  }

  constructor(
    downloadsPath: string,
    maxConcurrent: number,
    eventEmitter: DownloadEventEmitter,
    private readonly oneFichierConfig: OneFichierConfig,
    archiveExtractor?: ArchiveExtractorService,
  ) {
    super('one-fichier', downloadsPath, maxConcurrent, eventEmitter, archiveExtractor);
    this.logger.log(`1Fichier plugin initialized in ${this.isPremium ? 'premium' : 'free'} mode`);
  }

  public canDownload(url: string): boolean {
    return url.includes(this.oneFichierConfig.host);
  }

  private async resolveDownloadUrlPremium(url: string): Promise<string> {
    const response = await axios
      .post(
        `https://api.${this.oneFichierConfig.host}/v1/download/get_token.cgi`,
        { url },
        {
          headers: {
            Authorization: `Bearer ${this.oneFichierConfig.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      )
      .catch((error: AxiosError) => {
        const data = error.response?.data as Record<string, string> | undefined;
        const message = data?.message ?? error.message;

        if (error.response?.status === 403) {
          throw new OneFichierError(`1fichier API access denied: ${message}`, 15 * 60 * 1000);
        }

        throw new OneFichierError(`1fichier API error: ${message}`);
      });

    if (response.data.status !== 'OK') {
      const message = response.data.message ?? JSON.stringify(response.data);
      throw new OneFichierError(`1fichier API error: ${message}`);
    }

    return response.data.url;
  }

  private async resolveDownloadUrlFree(url: string): Promise<string> {
    const pageResponse = await axios.get(url, { headers: WEB_HEADERS, maxRedirects: 0 }).catch((error: AxiosError) => {
      if (error.response?.status === 404) {
        throw new NotFoundException('File not found on 1fichier');
      }
      if (error.response?.status === 503) {
        throw new OneFichierError('1fichier is under maintenance', 20 * 60 * 1000);
      }
      throw error;
    });

    const pageHtml = pageResponse.data as string;
    detectErrors(pageHtml);

    this.logger.debug('Waiting for free download timer...');
    await sleep(FREE_DOWNLOAD_WAIT_MS);

    const postResponse = await axios.post(url, '', {
      headers: { ...WEB_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const postHtml = postResponse.data as string;
    detectErrors(postHtml);

    const downloadLink = extractDownloadLink(postHtml);
    if (!downloadLink) {
      throw new OneFichierError('Could not extract download link from 1fichier page');
    }

    return downloadLink;
  }

  private async resolveDownloadUrl(url: string): Promise<string> {
    if (this.isPremium) {
      return this.resolveDownloadUrlPremium(url);
    }
    return this.resolveDownloadUrlFree(url);
  }

  public async getMediaInfo(url: string): Promise<DownloadInfos> {
    this.logger.log(`Getting media info for ${url}`);

    if (this.isPremium) {
      const response = await axios
        .post(
          `https://api.${this.oneFichierConfig.host}/v1/file/info.cgi`,
          { url },
          {
            headers: {
              Authorization: `Bearer ${this.oneFichierConfig.apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        )
        .catch(() => null);

      if (response?.data?.status === 'OK') {
        return {
          fileName: response.data.filename,
          size: response.data.size ?? null,
        };
      }
    }

    const downloadUrl = await this.resolveDownloadUrl(url);
    const headResponse = await axios.head(downloadUrl);
    return {
      fileName: getFileName(headResponse),
      size: getContentLength(headResponse),
    };
  }

  protected async startDownload(item: DownloadItem): Promise<{ infos: DownloadInfos; stream: Readable }> {
    this.logger.log(`Resolving ${item.url} (${this.isPremium ? 'premium' : 'free'} mode)`);

    const downloadUrl = await this.resolveDownloadUrl(item.url);
    const response = await axios.get(downloadUrl, { responseType: 'stream' });

    return {
      infos: {
        fileName: getFileName(response),
        size: getContentLength(response),
      },
      stream: response.data as Readable,
    };
  }
}
