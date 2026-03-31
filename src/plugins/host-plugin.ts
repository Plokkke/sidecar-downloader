import { Readable } from 'stream';

export type FileInfo = {
  fileName: string;
  size: number | null;
};

export type DownloadStream = {
  infos: FileInfo;
  stream: Readable;
};

export interface HostPlugin {
  readonly name: string;
  readonly urlPattern: string;
  canHandle(url: string): boolean;
  getFileInfo(url: string): Promise<FileInfo>;
  download(url: string): Promise<DownloadStream>;
}
