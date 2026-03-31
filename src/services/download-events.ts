import { EventEmitter } from 'node:events';

import { Injectable } from '@nestjs/common';

import { DownloadingInfos } from '@/schemas/DownloadItem';

export enum DownloadEventType {
  Progress = 'download.progress',
  Completed = 'download.completed',
  Failed = 'download.failed',
  Removed = 'download.removed',
}

export type DownloadProgressEvent = {
  id: string;
  status: string;
  fileName: string;
  progress: number | null;
  speed: number;
  eta: number | null;
  downloaded: number;
};

export type DownloadCompletedEvent = Pick<
  DownloadingInfos,
  'id' | 'fileName' | 'filePaths' | 'size' | 'source' | 'downloadedAt' | 'completedAt'
>;

export type DownloadFailedEvent = Pick<DownloadingInfos, 'id' | 'fileName' | 'error' | 'source'>;

export type DownloadRemovedEvent = { id: string };

interface DownloadEventMap {
  [DownloadEventType.Progress]: DownloadProgressEvent;
  [DownloadEventType.Completed]: DownloadCompletedEvent;
  [DownloadEventType.Failed]: DownloadFailedEvent;
  [DownloadEventType.Removed]: DownloadRemovedEvent;
}

@Injectable()
export class DownloadEventEmitter {
  private readonly emitter = new EventEmitter();

  emit<T extends DownloadEventType>(event: T, payload: DownloadEventMap[T]): void {
    this.emitter.emit(event, payload);
  }

  on<T extends DownloadEventType>(event: T, listener: (payload: DownloadEventMap[T]) => void): void {
    this.emitter.on(event, listener);
  }

  off<T extends DownloadEventType>(event: T, listener: (payload: DownloadEventMap[T]) => void): void {
    this.emitter.off(event, listener);
  }
}
