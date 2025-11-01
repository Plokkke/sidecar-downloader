import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as nock from 'nock';

import { configureAppModule } from '@/app.module';
import { EnvironmentVariables } from '@/environment';

export let APP: INestApplication;
export const CONFIG: EnvironmentVariables = {
  server: {
    port: 3000,
    apiKey: '13e4872b-12af-4707-85d6-8b7dbcdc6878',
    logLevel: 'info',
  },
  session: {
    secret: 'change-this-in-production-minimum-32-characters',
  },
  oneFichier: {
    host: '1fichier.com',
    apiKey: 'uuid-1234567098a',
  },
  download: {
    moviesPath: '/tmp/medias/movies',
    showsPath: '/tmp/medias/shows',
  },
};

beforeAll(async () => {
  try {
    const AppModule = configureAppModule(CONFIG);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    APP = moduleFixture.createNestApplication();

    await APP.init();
  } catch (e) {
    console.error(e);
    throw e;
  }
});

beforeEach(() => {
  nock.cleanAll();
});

afterAll(async () => {
  await APP.close();
});
