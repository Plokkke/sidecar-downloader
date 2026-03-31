import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';

import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { ArchivePlugin } from '@/plugins/archive-plugin';
import { HostPlugin } from '@/plugins/host-plugin';
import { PluginRegistry } from '@/plugins/plugin-registry';
import { DownloadingInfos, DownloadItem, DownloadStatus } from '@/schemas/DownloadItem';
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

@Injectable()
export class DownloadEngine {
  private readonly logger = new Logger(DownloadEngine.name);
  private items: ActiveDownload[] = [];

  constructor(
    private readonly registry: PluginRegistry,
    private readonly eventEmitter: DownloadEventEmitter,
    private readonly downloadsPath: string,
    private readonly maxConcurrent: number,
  ) {
    fs.mkdirSync(this.downloadsPath, { recursive: true });
  }

  list(): DownloadingInfos[] {
    return this.items.map((item) => item.infos);
  }

  get(id: string): DownloadingInfos | undefined {
    return this.items.find((item) => item.infos.id === id)?.infos;
  }

  clearCompleted(): number {
    const toRemove = this.items.filter(
      (d) => d.infos.status === DownloadStatus.Completed || d.infos.status === DownloadStatus.Failed,
    );
    this.items = this.items.filter((d) => !toRemove.includes(d));

    for (const item of toRemove) {
      this.eventEmitter.emit(DownloadEventType.Removed, { id: item.infos.id });
    }

    this.logger.log(`Cleared ${toRemove.length} completed/failed downloads`);
    return toRemove.length;
  }

  cancel(id: string): boolean {
    const item = this.items.find((d) => d.infos.id === id);
    if (!item || item.infos.status === DownloadStatus.Completed) {
      return false;
    }

    item.stream?.destroy();
    this.items = this.items.filter((d) => d.infos.id !== id);

    if (item.filePath && fs.existsSync(item.filePath)) {
      fs.unlinkSync(item.filePath);
    }

    this.logger.log(`Download ${item.infos.fileName} cancelled`);
    this.eventEmitter.emit(DownloadEventType.Removed, { id });
    this.dequeue();
    return true;
  }

  async download(item: DownloadItem): Promise<DownloadingInfos> {
    const plugin = this.registry.findHostFor(item.url);
    if (!plugin) {
      throw new Error(`No plugin found for URL: ${item.url}`);
    }

    const activeCount = this.items.filter((d) => ACTIVE_STATUSES.includes(d.infos.status)).length;
    const active = this.createItem(item, plugin);
    this.items.push(active);

    if (activeCount < this.maxConcurrent) {
      this.processDownload(active, plugin);
    } else {
      this.logger.log(`Queued ${item.url} (${activeCount}/${this.maxConcurrent} active)`);
    }

    return active.infos;
  }

  private createItem(item: DownloadItem, plugin: HostPlugin): ActiveDownload {
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
        source: plugin.name,
        createdAt: new Date(),
        downloadedAt: null,
        completedAt: null,
      },
      filePath: '',
      speedSamples: [],
    };
  }

  private async processDownload(active: ActiveDownload, plugin: HostPlugin): Promise<void> {
    try {
      active.infos.status = DownloadStatus.Resolving;
      const { infos, stream } = await plugin.download(active.item.url);

      active.infos.status = DownloadStatus.Downloading;
      active.infos.fileName = infos.fileName;
      active.infos.size = infos.size;
      active.filePath = path.join(this.downloadsPath, infos.fileName);
      active.stream = stream;

      const { value, unit } = infos.size ? humanFileSize(infos.size) : { value: NaN, unit: '' };
      this.logger.log(`Downloading ${infos.fileName} (${value}${unit})`);

      await this.pipeToFile(active, stream);
    } catch (error) {
      this.fail(active, `Download failed for ${active.item.url}: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async pipeToFile(active: ActiveDownload, stream: Readable): Promise<void> {
    const tracker = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        active.infos.downloaded += chunk.length;
        active.speedSamples.push({ timestamp: Date.now(), bytes: chunk.length });

        const now = Date.now();
        active.speedSamples = active.speedSamples.filter((s) => now - s.timestamp < SPEED_WINDOW_MS);

        active.infos.speed = computeSpeed(active.speedSamples);
        active.infos.eta = computeEta(active.infos.size, active.infos.downloaded, active.infos.speed);
        if (active.infos.size) {
          active.infos.progress = active.infos.downloaded / active.infos.size;
        }

        this.emitProgress(active);
        callback(null, chunk);
      },
    });

    await pipeline(stream, tracker, fs.createWriteStream(active.filePath));

    active.infos.speed = 0;
    active.infos.eta = null;
    active.infos.progress = 1;
    active.infos.downloadedAt = new Date();

    const stat = fs.statSync(active.filePath);
    this.logger.debug(`File written: ${active.filePath} (${stat.size} bytes)`);

    const archivePlugin = this.registry.findArchiveFor(active.filePath);
    this.logger.debug(`Archive plugin for ${active.infos.fileName}: ${archivePlugin?.name ?? 'none'}`);

    if (archivePlugin) {
      await this.handleExtraction(active, archivePlugin);
    } else {
      active.infos.filePaths = [active.filePath];
      this.complete(active);
    }
  }

  private async handleExtraction(active: ActiveDownload, archivePlugin: ArchivePlugin): Promise<void> {
    active.infos.status = DownloadStatus.Extracting;
    active.infos.progress = null;
    active.infos.speed = 0;
    active.infos.eta = null;
    this.emitProgress(active);

    const baseName = active.infos.fileName.replace(/\.[^.]+$/, '');
    const targetDir = path.join(this.downloadsPath, baseName);
    fs.mkdirSync(targetDir, { recursive: true });

    this.logger.log(`Extracting with ${archivePlugin.name}: ${active.infos.fileName}`);

    try {
      const result = await archivePlugin.extract(active.filePath);
      let bytesWritten = 0;
      const filePaths: string[] = [];

      for await (const file of result.files) {
        const targetPath = path.join(targetDir, file.name);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });

        const progressTracker = new Transform({
          transform: (chunk: Buffer, _encoding, callback) => {
            bytesWritten += chunk.length;
            if (result.totalSize > 0) {
              active.infos.progress = bytesWritten / result.totalSize;
              this.emitProgress(active);
            }
            callback(null, chunk);
          },
        });

        await pipeline(file.stream, progressTracker, fs.createWriteStream(targetPath));
        filePaths.push(targetPath);
      }

      fs.unlinkSync(active.filePath);
      active.infos.filePaths = filePaths;
      this.complete(active);
    } catch (error) {
      this.fail(active, `Extraction failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  private emitProgress(active: ActiveDownload): void {
    this.eventEmitter.emit(DownloadEventType.Progress, {
      id: active.infos.id,
      status: active.infos.status,
      fileName: active.infos.fileName,
      progress: active.infos.progress,
      speed: active.infos.speed,
      eta: active.infos.eta,
      downloaded: active.infos.downloaded,
    });
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
    if (activeCount >= this.maxConcurrent) {
      return;
    }

    const plugin = this.registry.findHostFor(queued.item.url);
    if (!plugin) {
      this.fail(queued, `No plugin found for URL: ${queued.item.url}`);
      return;
    }

    this.logger.log(`Dequeuing ${queued.item.url}`);
    this.processDownload(queued, plugin);
  }
}
