import { join } from 'node:path';

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as session from 'express-session';
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

  // Configure Handlebars for SSR
  app.setViewEngine('hbs');
  app.set('views', join(__dirname, 'views'));

  // Configure sessions with cookie storage
  const sessionSecret = env.session ? env.session.secret : 'change-this-in-production-minimum-32-characters';
  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: true,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      },
      name: 'downloader.sid',
    }),
  );

  // Serve static files
  app.useStaticAssets(join(__dirname, 'public'));

  app.useGlobalInterceptors(new LoggingInterceptor());

  await app.listen(env.server.port);
  logger.info(`Application is running on: ${await app.getUrl()}`);
})();
