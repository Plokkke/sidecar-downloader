import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { WinstonModule } from 'nest-winston';

import { configureAppModule } from '@/app.module';
import { loadEnv } from '@/environment';
import { LoggingInterceptor } from '@/interceptors/logging';
import { logger } from '@/services/logger';

(async () => {
  const env = loadEnv();

  const app = await NestFactory.create<NestExpressApplication>(configureAppModule(env), {
    logger: WinstonModule.createLogger({
      instance: logger,
    }),
  });

  app.useGlobalInterceptors(new LoggingInterceptor());

  await app.listen(env.server.port);
  logger.info(`Application is running on: ${await app.getUrl()}`);
})();
