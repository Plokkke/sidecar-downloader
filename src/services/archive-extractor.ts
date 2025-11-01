import * as fs from 'node:fs';
import * as path from 'node:path';

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

import { ArchiveHandler, RarHandler, ZipHandler } from './archive-handlers';

export interface SeasonInfo {
  seriesTitle: string;
  seasonNumber: string;
}

@Injectable()
export class ArchiveExtractorService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ArchiveExtractorService.name);
  private handlers: ArchiveHandler[];

  constructor() {
    this.handlers = [
      new ZipHandler(),
      new RarHandler(),
      // Easy to extend: new TarHandler(),
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

  /**
   * Find the appropriate handler for a file
   */
  private findHandler(filePath: string): ArchiveHandler | null {
    return this.handlers.find((handler) => handler.canHandle(filePath)) || null;
  }

  /**
   * Check if a file is an archive
   */
  isArchive(filePath: string): boolean {
    return this.findHandler(filePath) !== null;
  }

  /**
   * Extract season information from filename
   */
  extractSeasonInfo(fileName: string): SeasonInfo | null {
    // Remove extension
    const baseName = fileName.replace(/\.[^.]+$/, '');

    // Pattern for season detection: Season.XX, Saison.XX, SXX
    const seasonPatterns = [
      /^(.+?)[.\s_-]*[sS]eason[.\s_-]*([0-9]{1,2})/i,
      /^(.+?)[.\s_-]*[sS]aison[.\s_-]*([0-9]{1,2})/i,
      /^(.+?)[.\s_-]*[sS]([0-9]{1,2})(?:[^eE]|$)/,
      /^(.+?)[.\s_-]*[sS]([0-9]{1,2})[.\s_-]*complete/i,
      /^(.+?)[.\s_-]*[sS]([0-9]{1,2})[.\s_-]*integrale/i,
    ];

    for (const pattern of seasonPatterns) {
      const match = baseName.match(pattern);
      if (match) {
        const seriesTitle = match[1]
          .replace(/[.\s_-]+$/, '')
          .replace(/[.\s_-]+/g, '.')
          .trim();
        const seasonNumber = match[2].padStart(2, '0');

        return { seriesTitle, seasonNumber };
      }
    }

    // If no clear season pattern, might still be a full season with generic name
    if (/complete|integrale|full|season/i.test(baseName)) {
      // Try to extract series name before these keywords
      const match = baseName.match(/^(.+?)[.\s_-]*(complete|integrale|full|season)/i);
      if (match) {
        return {
          seriesTitle: match[1].replace(/[.\s_-]+/g, '.').trim(),
          seasonNumber: '01', // Default to season 1 if not specified
        };
      }
    }

    return null;
  }

  /**
   * Build the target directory path for extraction
   */
  buildExtractionPath(fileName: string, showsPath: string): string {
    const seasonInfo = this.extractSeasonInfo(fileName);

    if (!seasonInfo) {
      // If we can't detect season info, extract to a generic folder
      const baseName = fileName.replace(/\.[^.]+$/, '');
      return path.join(showsPath, baseName, 'extracted');
    }

    return path.join(showsPath, seasonInfo.seriesTitle, `Season${seasonInfo.seasonNumber}`);
  }

  /**
   * Extract an archive to the target directory
   */
  async extract(archivePath: string, fileName: string, showsPath: string): Promise<void> {
    if (!fs.existsSync(archivePath)) {
      const error = `Archive file not found: ${archivePath}`;
      this.logger.error(error);
      return;
    }

    // Find appropriate handler
    const handler = this.findHandler(archivePath);
    if (!handler) {
      const error = `No handler found for archive: ${archivePath}`;
      this.logger.error(error);
      return;
    }

    // Determine extraction directory
    const targetDir = this.buildExtractionPath(fileName, showsPath);
    fs.mkdirSync(targetDir, { recursive: true });

    this.logger.log(`Extracting archive: ${fileName} to ${targetDir}`);

    await handler.extract(archivePath, targetDir);
    await this.deleteArchive(archivePath);
  }

  /**
   * Delete the archive file after successful extraction
   */
  private async deleteArchive(archivePath: string): Promise<void> {
    try {
      fs.unlinkSync(archivePath);
      this.logger.log(`Deleted archive: ${path.basename(archivePath)}`);
    } catch (error) {
      this.logger.warn(`Failed to delete archive ${archivePath}: ${error}`);
    }
  }
}
