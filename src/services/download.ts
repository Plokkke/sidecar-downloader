import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'stream';

import { Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import { DownloadInfos, DownloadingItem, DownloadItem } from '@/schemas/DownloadItem';
import { humanFileSize } from '@/utils';

export const downloadConfigSchema = z.object({
  moviesPath: z.string(),
  showsPath: z.string(),
});

export type DownloadConfig = z.infer<typeof downloadConfigSchema>;

type ActiveDownload = DownloadingItem & {
  stream: Readable;
  filePath: string;
};

function initItem(infos: DownloadInfos, stream: Readable, filePath: string): ActiveDownload {
  return {
    id: uuidv4(),
    status: 'Initializing',
    fileName: infos.fileName,
    size: infos.size,
    downloaded: 0,
    progress: infos.size ? 0 : undefined,
    stream,
    filePath,
  };
}

interface MediaInfo {
  type: 'movie' | 'show';
  title: string;
  season?: string;
}

function detectMediaType(fileName: string): MediaInfo {
  // Match SxxExx pattern anywhere in the filename
  const showMatch = fileName.match(/[sS]([0-9]{1,2})[eE][0-9]{1,2}/);

  if (showMatch) {
    const title = fileName
      .substring(0, showMatch.index)
      .replace(/[^a-zA-Z0-9]+$/, '')
      .trim();
    const season = showMatch[1].padStart(2, '0');
    return {
      type: 'show',
      title,
      season,
    };
  }

  return {
    type: 'movie',
    title: fileName.replace(/[^a-zA-Z0-9]+$/, '').trim(),
  };
}

export abstract class DownloadService {
  private items: ActiveDownload[] = [];

  protected constructor(
    public readonly name: string,
    private readonly config: DownloadConfig,
  ) {
    fs.mkdirSync(this.config.moviesPath, { recursive: true });
    fs.mkdirSync(this.config.showsPath, { recursive: true });
  }

  protected abstract get logger(): Logger;

  public abstract canDownload(url: string): boolean | Promise<boolean>;
  public abstract download(item: DownloadItem): Promise<DownloadingItem>;
  public abstract getMediaInfo(url: string): Promise<DownloadInfos>;

  public list(): DownloadingItem[] {
    return this.items;
  }

  public cleanCompleted(): void {
    const itemsCount = this.items.length;
    this.items = this.items.filter((item) => item.status !== 'Completed');
    this.logger.debug(`Removed ${itemsCount - this.items.length} completed items`);
  }

  public cancel(id: string): boolean {
    const activeDownload = this.items.find((item) => item.id === id);
    if (!activeDownload || activeDownload.status === 'Completed') {
      return false;
    }

    activeDownload.stream.destroy();
    this.items = this.items.filter((item) => item.id !== id);

    if (fs.existsSync(activeDownload.filePath)) {
      fs.unlinkSync(activeDownload.filePath);
    }

    this.logger.log(`Download of ${activeDownload.fileName} cancelled`);
    return true;
  }

  private mediaLocalization(infos: DownloadInfos): string {
    const mediaInfo = detectMediaType(infos.fileName);
    const fileName = infos.fileName;
    const targetPath =
      mediaInfo.type === 'show'
        ? path.join(this.config.showsPath, mediaInfo.title, `Season${mediaInfo.season}`)
        : this.config.moviesPath;
    fs.mkdirSync(targetPath, { recursive: true });
    return path.join(targetPath, fileName);
  }

  protected save(infos: DownloadInfos, stream: Readable): DownloadingItem {
    const filePath = this.mediaLocalization(infos);
    const writeStream = fs.createWriteStream(filePath, { flags: 'w' });

    const downloadingItem = initItem(infos, stream, filePath);

    this.items.push(downloadingItem);

    stream.on('data', (chunk: Buffer) => {
      downloadingItem.status = 'Downloading';
      downloadingItem.downloaded += chunk.length;
      if (downloadingItem.size) {
        downloadingItem.progress = downloadingItem.downloaded / downloadingItem.size;
      }
    });

    stream.on('end', () => {
      if (downloadingItem.status !== 'Error') {
        downloadingItem.status = 'Completed';
        this.logger.log(`Download of ${infos.fileName} completed`);
      }
    });

    stream.on('error', (error) => {
      downloadingItem.status = 'Error';
      this.logger.error(`Error downloading ${infos.fileName}`, error);
    });

    stream.pipe(writeStream);
    const { value, unit } = infos.size ? humanFileSize(infos.size) : { value: NaN, unit: '' };
    this.logger.log(`Writing ${filePath} to disk (size: ${value}${unit})`);

    return downloadingItem;
  }
}
