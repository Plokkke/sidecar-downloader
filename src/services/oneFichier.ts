import { Readable } from 'stream';

import { InternalServerErrorException, Logger, UnauthorizedException } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import { z } from 'zod';

import { DownloadingItem, DownloadItem, DownloadInfos } from '@/schemas/DownloadItem';
import { ArchiveExtractorService } from '@/services/archive-extractor';
import { DownloadConfig, DownloadService } from '@/services/download';

export const oneFichierConfigSchema = z.object({
  host: z.string().trim().min(1),
  apiKey: z.string().trim().min(1),
});

export type OneFichierConfig = z.infer<typeof oneFichierConfigSchema>;

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

export class OneFichierDownloadService extends DownloadService {
  protected logger: Logger = new Logger(OneFichierDownloadService.name);

  constructor(
    downloadConfig: DownloadConfig,
    private readonly oneFichierConfig: OneFichierConfig,
    archiveExtractor?: ArchiveExtractorService,
  ) {
    super('1Fichier', downloadConfig, archiveExtractor);
  }

  public canDownload(url: string): boolean {
    const canDl = url.includes(this.oneFichierConfig.host);
    this.logger.debug(`Can download ${url} from 1fichier: ${canDl}`);
    return canDl;
  }

  private async getAccessToken(url: string): Promise<string> {
    const response: AxiosResponse = await axios
      .post(
        `https://api.${this.oneFichierConfig.host}/v1/download/get_token.cgi`,
        {
          url,
        },
        {
          headers: {
            Authorization: `Bearer ${this.oneFichierConfig.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      )
      .catch((error) => {
        this.logger.error(`Failed to get access token: ${JSON.stringify(error.response?.data)}`);
        throw new UnauthorizedException(`Failed to get access token.`);
      });

    if (response.data.status !== 'OK') {
      this.logger.error(`Error from 1fichier API: ${JSON.stringify(response.data)}`);
      throw new InternalServerErrorException(`Error from 1fichier API`);
    }

    this.logger.log(`Received access token for ${url}`);
    return response.data.url;
  }

  public async getMediaInfo(url: string): Promise<DownloadInfos> {
    this.logger.log(`Getting media info for ${url} from 1fichier`);

    const downloadUrl = await this.getAccessToken(url);

    const response = await axios.head(downloadUrl);

    this.logger.debug(`Headers: ${JSON.stringify(response.headers)}`);
    return {
      fileName: getFileName(response),
      size: getContentLength(response),
    };
  }

  public async download(item: DownloadItem): Promise<DownloadingItem> {
    this.logger.log(`Downloading ${item.url} from 1fichier`);

    const downloadUrl = await this.getAccessToken(item.url);

    const response = await axios.get(downloadUrl, {
      responseType: 'stream',
    });

    this.logger.debug(`Headers: ${JSON.stringify(response.headers)}`);
    return super.save(
      {
        fileName: getFileName(response),
        size: getContentLength(response),
      },
      response.data as Readable,
    );
  }
}
