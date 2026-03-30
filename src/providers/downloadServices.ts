import { ConfigService } from '@nestjs/config';

import { Config } from '@/app.module';
import { ArchiveExtractorService } from '@/services/archive-extractor';
import { DownloadService } from '@/services/download';
import { DownloadEventEmitter } from '@/services/download-events';
import { OneFichierDownloadService } from '@/services/oneFichier';

const DOWNLOAD_SERVICES_TOKEN = Symbol('DOWNLOAD_SERVICES_TOKEN');

export const downloadServicesProvider = {
  provide: DOWNLOAD_SERVICES_TOKEN,
  useFactory: async (
    configService: ConfigService<Config, true>,
    archiveExtractor: ArchiveExtractorService,
    eventEmitter: DownloadEventEmitter,
  ): Promise<DownloadService[]> => {
    const services: DownloadService[] = [];
    const downloadsPath = configService.get('downloadsPath');
    const maxConcurrent = configService.get('maxConcurrentDownloads');
    const oneFichierConfig = configService.get('oneFichier');
    if (oneFichierConfig) {
      services.push(
        new OneFichierDownloadService(downloadsPath, maxConcurrent, eventEmitter, oneFichierConfig, archiveExtractor),
      );
    }
    return services;
  },
  inject: [ConfigService, ArchiveExtractorService, DownloadEventEmitter],
};
