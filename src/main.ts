import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { WinstonModule } from 'nest-winston';

import { configureAppModule } from '@/app.module';
import { loadEnv } from '@/environment';
import { LoggingInterceptor } from '@/interceptors/logging';
import { logger } from '@/services/logger';

(async () => {
  const env = loadEnv();

  const app = await NestFactory.create(configureAppModule(env), {
    logger: WinstonModule.createLogger({
      instance: logger,
    }),
  });

  app.useWebSocketAdapter(new WsAdapter(app));
  app.useGlobalInterceptors(new LoggingInterceptor());

  await app.listen(env.server.port);
  logger.info(`Application is running on: ${await app.getUrl()}`);
})();
