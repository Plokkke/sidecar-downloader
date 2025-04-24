import { Controller, Get, Inject, Logger, Query, UseGuards } from '@nestjs/common';

import { MatchingHeaders } from '@/decorators/MatchingHeaders';
import { MatchingHeadersGuard } from '@/guards/MatchingHeaderGuard';
import { DOWNLOAD_SERVICES_TOKEN } from '@/providers/downloadServices';
import { DownloadInfos } from '@/schemas/DownloadItem';
import { DownloadService } from '@/services/download';

@Controller('/infos')
export class InfosController {
  private readonly logger = new Logger(InfosController.name);

  constructor(
    @Inject(DOWNLOAD_SERVICES_TOKEN)
    private readonly downloadServices: DownloadService[],
  ) {
    if (!downloadServices.length) {
      this.logger.error('No download services configured');
      throw new Error('No download services configured');
    }
  }

  @Get('/')
  @MatchingHeaders([{ headerKey: 'x-api-key', configPath: 'server.apiKey' }])
  @UseGuards(MatchingHeadersGuard)
  async getMediaInfo(@Query('url') url: string): Promise<DownloadInfos> {
    this.logger.log(`Getting media info for ${url}`);

    const downloadService = this.downloadServices.find((service) => service.canDownload(url));

    if (!downloadService) {
      this.logger.log(`No service found for ${url}`);
      throw new Error('No service found for this URL');
    }

    return await downloadService.getMediaInfo(url);
  }
}
