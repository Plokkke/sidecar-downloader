import { Logger } from '@nestjs/common';
import * as yauzl from 'yauzl';

import { ArchivePlugin, ExtractedFile, ExtractionResult } from '@/plugins/archive-plugin';

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function openZip(filePath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (err, zipFile) => {
      if (err || !zipFile) {
        return reject(err ?? new Error('Failed to open zip'));
      }
      return resolve(zipFile);
    });
  });
}

function readEntry(zipFile: yauzl.ZipFile): Promise<yauzl.Entry | null> {
  return new Promise((resolve) => {
    zipFile.once('entry', resolve);
    zipFile.once('end', () => resolve(null));
    zipFile.readEntry();
  });
}

function openReadStream(zipFile: yauzl.ZipFile, entry: yauzl.Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (err, stream) => {
      if (err || !stream) {
        return reject(err ?? new Error('Failed to open read stream'));
      }
      return resolve(stream);
    });
  });
}

function collectTotalBytes(zipFile: yauzl.ZipFile): Promise<{ totalBytes: number; entryCount: number }> {
  return new Promise((resolve) => {
    let totalBytes = 0;
    let entryCount = 0;

    zipFile.on('entry', (entry: yauzl.Entry) => {
      entryCount += 1;
      if (!entry.fileName.endsWith('/')) {
        totalBytes += entry.uncompressedSize;
      }
      zipFile.readEntry();
    });

    zipFile.on('end', () => resolve({ totalBytes, entryCount }));
    zipFile.readEntry();
  });
}

export class ZipArchivePlugin implements ArchivePlugin {
  readonly name = 'zip';
  private readonly logger = new Logger(ZipArchivePlugin.name);

  canHandle(header: Buffer): boolean {
    return header.length >= 4 && header.subarray(0, 4).equals(ZIP_MAGIC);
  }

  async extract(filePath: string): Promise<ExtractionResult> {
    const scanZip = await openZip(filePath);
    const { totalBytes, entryCount } = await collectTotalBytes(scanZip);
    scanZip.close();

    this.logger.log(`ZIP archive: ${entryCount} entries, ${(totalBytes / 1024 / 1024).toFixed(1)} MB total`);

    const zipFile = await openZip(filePath);

    return {
      totalSize: totalBytes,
      files: this.iterateEntries(zipFile),
    };
  }

  private async *iterateEntries(zipFile: yauzl.ZipFile): AsyncIterable<ExtractedFile> {
    try {
      let entry = await readEntry(zipFile);
      while (entry) {
        if (!entry.fileName.endsWith('/')) {
          const stream = await openReadStream(zipFile, entry);
          yield {
            name: entry.fileName,
            size: entry.uncompressedSize,
            stream: stream as NodeJS.ReadableStream as import('stream').Readable,
          };
        }
        entry = await readEntry(zipFile);
      }
    } finally {
      zipFile.close();
    }
  }
}
