import { Controller, Get, Logger, NotFoundException, Query, UseGuards } from '@nestjs/common';

import { MatchingHeaders } from '@/decorators/MatchingHeaders';
import { MatchingHeadersGuard } from '@/guards/MatchingHeaderGuard';
import { FileInfo } from '@/plugins/host-plugin';
import { PluginRegistry } from '@/plugins/plugin-registry';

@Controller('/infos')
export class InfosController {
  private readonly logger = new Logger(InfosController.name);

  constructor(private readonly registry: PluginRegistry) {}

  @Get('/')
  @MatchingHeaders([{ headerKey: 'x-api-key', configPath: 'server.apiKey' }])
  @UseGuards(MatchingHeadersGuard)
  async getMediaInfo(@Query('url') url: string): Promise<FileInfo> {
    this.logger.log(`Getting file info for ${url}`);

    const plugin = this.registry.findHostFor(url);
    if (!plugin) {
      throw new NotFoundException('No plugin found for this URL');
    }

    return plugin.getFileInfo(url);
  }
}
