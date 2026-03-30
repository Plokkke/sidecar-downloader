import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'stream';

import { Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { DownloadInfos, DownloadingInfos, DownloadItem, DownloadStatus } from '@/schemas/DownloadItem';
import { ArchiveExtractorService } from '@/services/archive-extractor';
import { DownloadEventEmitter, DownloadEventType } from '@/services/download-events';
import { humanFileSize } from '@/utils';

const ACTIVE_STATUSES = [DownloadStatus.Resolving, DownloadStatus.Downloading, DownloadStatus.Extracting];

const SPEED_WINDOW_MS = 5000;

type SpeedSample = { timestamp: number; bytes: number };

type ActiveDownload = {
  item: DownloadItem;
  infos: DownloadingInfos;
  stream?: Readable;
  filePath: string;
  speedSamples: SpeedSample[];
};

function computeSpeed(samples: SpeedSample[]): number {
  const now = Date.now();
  const recent = samples.filter((s) => now - s.timestamp < SPEED_WINDOW_MS);
  if (recent.length < 2) {
    return 0;
  }
  const totalBytes = recent.reduce((sum, s) => sum + s.bytes, 0);
  const elapsed = (now - recent[0].timestamp) / 1000;
  return elapsed > 0 ? totalBytes / elapsed : 0;
}

function computeEta(size: number | null, downloaded: number, speed: number): number | null {
  if (!size || speed <= 0) {
    return null;
  }
  return Math.round((size - downloaded) / speed);
}

export abstract class DownloadService {
  private items: ActiveDownload[] = [];

  protected constructor(
    public readonly name: string,
    private readonly downloadsPath: string,
    private readonly maxConcurrent: number,
    private readonly eventEmitter: DownloadEventEmitter,
    protected archiveExtractor?: ArchiveExtractorService,
  ) {
    fs.mkdirSync(this.downloadsPath, { recursive: true });
  }

  protected abstract get logger(): Logger;

  public abstract canDownload(url: string): boolean | Promise<boolean>;
  protected abstract startDownload(item: DownloadItem): Promise<{ infos: DownloadInfos; stream: Readable }>;
  public abstract getMediaInfo(url: string): Promise<DownloadInfos>;

  public list(): DownloadingInfos[] {
    return this.items.map((item) => item.infos);
  }

  public get(id: string): DownloadingInfos | undefined {
    return this.items.find((item) => item.infos.id === id)?.infos;
  }

  public cancel(id: string): boolean {
    const item = this.items.find((item) => item.infos.id === id);
    if (!item || item.infos.status === DownloadStatus.Completed) {
      return false;
    }

    item.stream?.destroy();
    this.items = this.items.filter((it) => it.infos.id !== id);

    if (fs.existsSync(item.filePath)) {
      fs.unlinkSync(item.filePath);
    }

    this.logger.log(`Download ${item.infos.fileName} cancelled`);
    this.dequeue();
    return true;
  }

  public async download(item: DownloadItem): Promise<DownloadingInfos> {
    const activeCount = this.items.filter((d) => ACTIVE_STATUSES.includes(d.infos.status)).length;

    const downloadingItem = this.createItem(item);
    this.items.push(downloadingItem);

    if (activeCount < this.maxConcurrent) {
      this.processDownload(downloadingItem);
    } else {
      this.logger.log(`Queued ${item.url} (${activeCount}/${this.maxConcurrent} active)`);
    }

    return downloadingItem.infos;
  }

  private createItem(item: DownloadItem): ActiveDownload {
    return {
      item,
      infos: {
        id: uuidv4(),
        status: DownloadStatus.Queued,
        fileName: '',
        filePaths: [],
        size: null,
        downloaded: 0,
        progress: null,
        speed: 0,
        eta: null,
        error: null,
        source: this.name,
        createdAt: new Date(),
        downloadedAt: null,
        completedAt: null,
      },
      filePath: '',
      speedSamples: [],
    };
  }

  private async processDownload(active: ActiveDownload): Promise<void> {
    try {
      active.infos.status = DownloadStatus.Resolving;
      const { infos, stream } = await this.startDownload(active.item);

      active.infos.status = DownloadStatus.Downloading;
      active.infos.fileName = infos.fileName;
      active.infos.size = infos.size;
      active.filePath = path.join(this.downloadsPath, infos.fileName);
      active.stream = stream;

      this.pipeStream(active);
    } catch (error) {
      this.fail(active, `Download failed for ${active.item.url}: ${error instanceof Error ? error.message : error}`);
    }
  }

  private pipeStream(active: ActiveDownload): void {
    const stream = active.stream!;
    const infos = active.infos;
    const writeStream = fs.createWriteStream(active.filePath, { flags: 'w' });

    stream.on('data', (chunk: Buffer) => {
      infos.downloaded += chunk.length;
      active.speedSamples.push({ timestamp: Date.now(), bytes: chunk.length });

      const now = Date.now();
      active.speedSamples = active.speedSamples.filter((s) => now - s.timestamp < SPEED_WINDOW_MS);

      infos.speed = computeSpeed(active.speedSamples);
      infos.eta = computeEta(infos.size, infos.downloaded, infos.speed);

      if (infos.size) {
        infos.progress = infos.downloaded / infos.size;
      }

      this.eventEmitter.emit(DownloadEventType.Progress, {
        id: infos.id,
        status: infos.status,
        fileName: infos.fileName,
        progress: infos.progress,
        speed: infos.speed,
        eta: infos.eta,
        downloaded: infos.downloaded,
      });
    });

    stream.on('end', async () => {
      if (infos.status === DownloadStatus.Failed) {
        return;
      }

      infos.speed = 0;
      infos.eta = null;
      infos.progress = 1;
      infos.downloadedAt = new Date();

      if (this.archiveExtractor?.isArchive(active.filePath)) {
        await this.handleExtraction(active);
      } else {
        infos.filePaths = [active.filePath];
        this.complete(active);
      }
    });

    stream.on('error', (error) => {
      this.fail(active, `Stream error for ${infos.fileName}: ${error.message}`);
    });

    stream.pipe(writeStream);
    const { value, unit } = infos.size ? humanFileSize(infos.size) : { value: NaN, unit: '' };
    this.logger.log(`Downloading ${infos.fileName} (${value}${unit})`);
  }

  private async handleExtraction(active: ActiveDownload): Promise<void> {
    active.infos.status = DownloadStatus.Extracting;
    active.infos.progress = null;
    active.infos.speed = 0;
    active.infos.eta = null;
    this.logger.log(`Extracting archive: ${active.infos.fileName}`);

    try {
      // TODO improve data transfert between service to get progress and content without reading disk;
      const extractedDir = await this.archiveExtractor!.extract(active.filePath);
      active.infos.filePaths = await this.listFiles(extractedDir);
      this.complete(active);
    } catch (error) {
      this.fail(active, `Extraction failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  private fail(active: ActiveDownload, error: string): void {
    active.infos.status = DownloadStatus.Failed;
    active.infos.error = error;
    this.logger.error(error);

    this.eventEmitter.emit(DownloadEventType.Failed, {
      id: active.infos.id,
      fileName: active.infos.fileName,
      error: active.infos.error,
      source: active.infos.source,
    });

    this.dequeue();
  }

  private complete(active: ActiveDownload): void {
    active.infos.status = DownloadStatus.Completed;
    active.infos.progress = 1;
    active.infos.completedAt = new Date();
    this.logger.log(`Completed: ${active.infos.fileName} (${active.infos.filePaths.length} file(s))`);

    this.eventEmitter.emit(DownloadEventType.Completed, {
      id: active.infos.id,
      fileName: active.infos.fileName,
      filePaths: active.infos.filePaths,
      size: active.infos.size,
      source: active.infos.source,
      downloadedAt: active.infos.downloadedAt,
      completedAt: active.infos.completedAt,
    });

    this.dequeue();
  }

  private dequeue(): void {
    const queued = this.items.find((d) => d.infos.status === DownloadStatus.Queued);
    if (!queued) {
      return;
    }

    const activeCount = this.items.filter((d) => ACTIVE_STATUSES.includes(d.infos.status)).length;

    if (activeCount < this.maxConcurrent) {
      this.logger.log(`Dequeuing ${queued.item.url}`);
      this.processDownload(queued);
    }
  }

  private async listFiles(directory: string): Promise<string[]> {
    const entries = await fs.promises.readdir(directory, { recursive: true, withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name));
  }
}
