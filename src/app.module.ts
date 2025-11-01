import { Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

import { DownloadController } from '@/controllers/download';
import { InfosController } from '@/controllers/infos';
import { EnvironmentVariables } from '@/environment';
import { HealthModule } from '@/modules/health/health.module';
import { downloadServicesProvider } from '@/providers/downloadServices';
import { ArchiveExtractorService } from '@/services/archive-extractor';
import { downloadConfigSchema } from '@/services/download';
import { oneFichierConfigSchema } from '@/services/oneFichier';

export const configSchema = z.object({
  server: z.object({
    port: z.number().optional().default(3000),
    apiKey: z.string().uuid(),
    logLevel: z.enum(['error', 'warn', 'info', 'verbose', 'debug', 'silly']).optional().default('info'),
  }),
  download: downloadConfigSchema,
  oneFichier: oneFichierConfigSchema.optional(),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: EnvironmentVariables): Config {
  return configSchema.parse({
    server: env.server,
    download: env.download,
    oneFichier: env.oneFichier,
  });
}

export function configureAppModule(env: EnvironmentVariables): new () => NestModule {
  @Module({
    imports: [ConfigModule.forRoot({ load: [() => env] }), HealthModule],
    controllers: [DownloadController, InfosController],
    providers: [
      ArchiveExtractorService,
      downloadServicesProvider,
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
