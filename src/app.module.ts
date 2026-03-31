import { Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

import { DownloadController } from '@/controllers/download';
import { InfosController } from '@/controllers/infos';
import { EnvironmentVariables } from '@/environment';
import { DownloadsGateway } from '@/gateways/downloads.gateway';
import { HealthModule } from '@/modules/health/health.module';
import { downloadEngineProvider } from '@/providers/download-engine';
import { pluginRegistryProvider } from '@/providers/plugin-registry';
import { DownloadEventEmitter } from '@/services/download-events';

export const configSchema = z.object({
  server: z.object({
    port: z.number().optional().default(3000),
    apiKey: z.string().uuid(),
    logLevel: z.enum(['error', 'warn', 'info', 'verbose', 'debug', 'silly']).optional().default('info'),
  }),
  downloadsPath: z.string(),
  maxConcurrentDownloads: z.number().int().min(1).default(3),
  hostPlugins: z.array(z.string()).min(1),
  archivePlugins: z.array(z.string()).default([]),
});

export type Config = z.infer<typeof configSchema>;

export function configureAppModule(env: EnvironmentVariables): new () => NestModule {
  @Module({
    imports: [ConfigModule.forRoot({ load: [() => env] }), HealthModule],
    controllers: [DownloadController, InfosController],
    providers: [
      DownloadEventEmitter,
      pluginRegistryProvider,
      downloadEngineProvider,
      DownloadsGateway,
      {
        provide: APP_PIPE,
        useClass: ZodValidationPipe,
      },
    ],
  })
  class App implements NestModule {
    configure(): void {}
  }

  return App;
}
