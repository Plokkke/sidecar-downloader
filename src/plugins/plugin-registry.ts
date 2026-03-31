import * as fs from 'node:fs';

import { Injectable, Logger } from '@nestjs/common';

import { ArchivePlugin } from '@/plugins/archive-plugin';
import { HostPlugin } from '@/plugins/host-plugin';

const MAGIC_BYTES_SIZE = 512;

@Injectable()
export class PluginRegistry {
  private readonly logger = new Logger(PluginRegistry.name);

  constructor(
    readonly hosts: HostPlugin[],
    readonly archives: ArchivePlugin[],
  ) {
    this.logger.log(`Registry loaded: ${hosts.length} host(s), ${archives.length} archive(s)`);
  }

  findHostFor(url: string): HostPlugin | undefined {
    return this.hosts.find((plugin) => plugin.canHandle(url));
  }

  findArchiveFor(filePath: string): ArchivePlugin | undefined {
    const fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(MAGIC_BYTES_SIZE);
    fs.readSync(fd, header, 0, MAGIC_BYTES_SIZE, 0);
    fs.closeSync(fd);

    return this.archives.find((plugin) => plugin.canHandle(header));
  }
}
