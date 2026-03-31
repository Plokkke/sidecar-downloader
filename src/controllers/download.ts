import { Body, Controller, Delete, Get, Logger, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';

import { MatchingHeaders } from '@/decorators/MatchingHeaders';
import { MatchingHeadersGuard } from '@/guards/MatchingHeaderGuard';
import { PluginRegistry } from '@/plugins/plugin-registry';
import { DownloadingInfos, DownloadItem } from '@/schemas/DownloadItem';
import { DownloadEngine } from '@/services/download-engine';

@Controller('/downloads')
export class DownloadController {
  private readonly logger = new Logger(DownloadController.name);

  constructor(
    private readonly engine: DownloadEngine,
    private readonly registry: PluginRegistry,
  ) {}

  @Post('/')
  @MatchingHeaders([{ headerKey: 'x-api-key', configPath: 'server.apiKey' }])
  @UseGuards(MatchingHeadersGuard)
  async createDownload(@Body() item: DownloadItem): Promise<DownloadingInfos> {
    return this.engine.download(item);
  }

  @Get('/')
  @MatchingHeaders([{ headerKey: 'x-api-key', configPath: 'server.apiKey' }])
  @UseGuards(MatchingHeadersGuard)
  getDownloads(): DownloadingInfos[] {
    return this.engine.list();
  }

  @Get('/plugins')
  @MatchingHeaders([{ headerKey: 'x-api-key', configPath: 'server.apiKey' }])
  @UseGuards(MatchingHeadersGuard)
  getPlugins(): { hosts: { name: string; urlPattern: string }[]; archives: string[] } {
    return {
      hosts: this.registry.hosts.map((h) => ({ name: h.name, urlPattern: h.urlPattern })),
      archives: this.registry.archives.map((a) => a.name),
    };
  }

  @Delete('/completed')
  @MatchingHeaders([{ headerKey: 'x-api-key', configPath: 'server.apiKey' }])
  @UseGuards(MatchingHeadersGuard)
  clearCompleted(): { cleared: number } {
    return { cleared: this.engine.clearCompleted() };
  }

  @Get('/:id')
  @MatchingHeaders([{ headerKey: 'x-api-key', configPath: 'server.apiKey' }])
  @UseGuards(MatchingHeadersGuard)
  getDownload(@Param('id') id: string): DownloadingInfos {
    const item = this.engine.get(id);
    if (!item) {
      throw new NotFoundException();
    }
    return item;
  }

  @Delete('/:id')
  @MatchingHeaders([{ headerKey: 'x-api-key', configPath: 'server.apiKey' }])
  @UseGuards(MatchingHeadersGuard)
  cancelDownload(@Param('id') id: string): { success: boolean } {
    if (!this.engine.cancel(id)) {
      throw new NotFoundException(`Download with id ${id} not found or already completed`);
    }
    return { success: true };
  }
}
