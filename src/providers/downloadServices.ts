import { ConfigService } from '@nestjs/config';

import { Config } from '@/app.module';
import { ArchiveExtractorService } from '@/services/archive-extractor';
import { DownloadService } from '@/services/download';
import { OneFichierDownloadService } from '@/services/oneFichier';

export const DOWNLOAD_SERVICES_TOKEN = 'DOWNLOAD_SERVICES_TOKEN';

export const downloadServicesProvider = {
  provide: DOWNLOAD_SERVICES_TOKEN,
  useFactory: async (
    configService: ConfigService<Config, true>,
    archiveExtractor: ArchiveExtractorService,
  ): Promise<DownloadService[]> => {
    const services: DownloadService[] = [];
    const downloadConfig = configService.get('download');
    const oneFichierConfig = configService.get('oneFichier');
    if (oneFichierConfig) {
      services.push(new OneFichierDownloadService(downloadConfig, oneFichierConfig, archiveExtractor));
    }
    return services;
  },
  inject: [ConfigService, ArchiveExtractorService],
};
