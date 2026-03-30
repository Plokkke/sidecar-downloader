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
import { downloadServicesProvider } from '@/providers/downloadServices';
import { DownloadingInfos, DownloadItem } from '@/schemas/DownloadItem';
import { DownloadService } from '@/services/download';

@Controller('/downloads')
export class DownloadController {
  private readonly logger = new Logger(DownloadController.name);

  constructor(
    @Inject(downloadServicesProvider.provide)
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
  async createDownload(@Body() item: DownloadItem): Promise<DownloadingInfos> {
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
  async getDownloads(): Promise<DownloadingInfos[]> {
    return this.downloadServices.flatMap((service) => service.list());
  }

  @Get('/plugins')
  @MatchingHeaders([{ headerKey: 'x-api-key', configPath: 'server.apiKey' }])
  @UseGuards(MatchingHeadersGuard)
  getPlugins(): { name: string }[] {
    return this.downloadServices.map((service) => ({ name: service.name }));
  }

  @Get('/:id')
  @MatchingHeaders([{ headerKey: 'x-api-key', configPath: 'server.apiKey' }])
  @UseGuards(MatchingHeadersGuard)
  async getDownload(@Param('id') id: string): Promise<DownloadingInfos> {
    for (const service of this.downloadServices) {
      const item = service.get(id);
      if (item) {
        return item;
      }
    }
    throw new NotFoundException();
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
