import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { MatchingHeaders } from '@/decorators/MatchingHeaders';
import { MatchingHeadersGuard } from '@/guards/MatchingHeaderGuard';
import { DOWNLOAD_SERVICES_TOKEN } from '@/providers/downloadServices';
import { DownloadingItem, DownloadItem } from '@/schemas/DownloadItem';
import { DownloadService } from '@/services/download';

@Controller('/downloads')
export class DownloadController {
  private readonly logger = new Logger(DownloadController.name);

  constructor(
    @Inject(DOWNLOAD_SERVICES_TOKEN)
    private readonly downloadServices: DownloadService[],
  ) {
    if (!downloadServices.length) {
      this.logger.error('No download services configured');
      throw new Error('No download services configured');
    }
  }

  @Post('/')
  @MatchingHeaders([{ headerKey: 'x-api-key', configPath: 'server.apiKey' }])
  @UseGuards(MatchingHeadersGuard)
  async createDownload(@Body() item: DownloadItem): Promise<DownloadingItem> {
    const downloadService = this.downloadServices.find((service) => service.canDownload(item.url));

    if (!downloadService) {
      this.logger.log(`No service found for ${item.url}`);
      throw new Error('No service found for this URL');
    }

    return await downloadService.download(item);
  }

  @Get('/')
  @MatchingHeaders([{ headerKey: 'x-api-key', configPath: 'server.apiKey' }])
  @UseGuards(MatchingHeadersGuard)
  async getDownloads(): Promise<DownloadingItem[]> {
    const items = this.downloadServices.flatMap((service) => service.list());
    for (const service of this.downloadServices) {
      service.cleanCompleted();
    }
    this.logger.debug(`Returning ${items.length} items`);
    return items;
  }

  @Get('/:id')
  @MatchingHeaders([{ headerKey: 'x-api-key', configPath: 'server.apiKey' }])
  @UseGuards(MatchingHeadersGuard)
  async getDownload(@Param('id') id: string): Promise<DownloadingItem> {
    const item = this.downloadServices.flatMap((service) => service.list()).find((item) => item.id === id);

    if (!item) {
      throw new NotFoundException();
    }

    return item;
  }

  @Delete('/:id')
  @MatchingHeaders([{ headerKey: 'x-api-key', configPath: 'server.apiKey' }])
  @UseGuards(MatchingHeadersGuard)
  async cancelDownload(@Param('id') id: string): Promise<{ success: boolean }> {
    this.logger.log(`Cancelling download with id ${id}`);

    let cancelled = false;
    for (const service of this.downloadServices) {
      if (service.cancel(id)) {
        cancelled = true;
        break;
      }
    }

    if (!cancelled) {
      throw new NotFoundException(`Download with id ${id} not found or already completed`);
    }

    return { success: true };
  }
}
