import { ConfigService } from '@nestjs/config';

import { Config } from '@/app.module';
import { PluginRegistry } from '@/plugins/plugin-registry';
import { DownloadEngine } from '@/services/download-engine';
import { DownloadEventEmitter } from '@/services/download-events';

export const downloadEngineProvider = {
  provide: DownloadEngine,
  useFactory: (
    registry: PluginRegistry,
    eventEmitter: DownloadEventEmitter,
    configService: ConfigService<Config, true>,
  ): DownloadEngine => {
    return new DownloadEngine(
      registry,
      eventEmitter,
      configService.get('downloadsPath'),
      configService.get('maxConcurrentDownloads'),
    );
  },
  inject: [PluginRegistry, DownloadEventEmitter, ConfigService],
};
