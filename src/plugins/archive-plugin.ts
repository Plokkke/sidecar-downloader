import { Readable } from 'stream';

export type ExtractedFile = {
  name: string;
  size: number;
  stream: Readable;
};

export type ExtractionResult = {
  totalSize: number;
  files: AsyncIterable<ExtractedFile>;
};

export interface ArchivePlugin {
  readonly name: string;
  canHandle(header: Buffer): boolean;
  extract(filePath: string): Promise<ExtractionResult>;
}
