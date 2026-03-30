import * as fs from 'node:fs';
import * as path from 'node:path';

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

import { ArchiveHandler, RarHandler, ZipHandler } from './archive-handlers';

@Injectable()
export class ArchiveExtractorService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ArchiveExtractorService.name);
  private handlers: ArchiveHandler[];

  constructor() {
    this.handlers = [
      new ZipHandler(),
      new RarHandler(),
    ];
  }

  async onApplicationBootstrap(): Promise<void> {
    const availableHandlers: ArchiveHandler[] = [];

    for (const handler of this.handlers) {
      const isAvailable = await handler.isAvailable();
      if (isAvailable) {
        availableHandlers.push(handler);
        this.logger.log(
          `${handler.requiredCommand} is available - ${handler.supportedExtensions.join(', ')} extraction enabled`,
        );
      } else {
        this.logger.warn(
          `${handler.requiredCommand} is not installed - ${handler.supportedExtensions.join(', ')} extraction disabled`,
        );
      }
    }

    this.handlers = availableHandlers;
    this.logger.log(`Archive extraction ready with ${this.handlers.length} handler(s)`);
  }

  private findHandler(filePath: string): ArchiveHandler | null {
    return this.handlers.find((handler) => handler.canHandle(filePath)) || null;
  }

  isArchive(filePath: string): boolean {
    return this.findHandler(filePath) !== null;
  }

  async extract(archivePath: string): Promise<string> {
    if (!fs.existsSync(archivePath)) {
      throw new Error(`Archive file not found: ${archivePath}`);
    }

    const handler = this.findHandler(archivePath);
    if (!handler) {
      throw new Error(`No handler found for archive: ${archivePath}`);
    }

    const baseName = path.basename(archivePath).replace(/\.[^.]+$/, '');
    const targetDir = path.join(path.dirname(archivePath), baseName);
    fs.mkdirSync(targetDir, { recursive: true });

    this.logger.log(`Extracting archive: ${path.basename(archivePath)} to ${targetDir}`);

    await handler.extract(archivePath, targetDir);

    try {
      fs.unlinkSync(archivePath);
      this.logger.log(`Deleted archive: ${path.basename(archivePath)}`);
    } catch (error) {
      this.logger.warn(`Failed to delete archive ${archivePath}: ${error}`);
    }

    return targetDir;
  }
}
