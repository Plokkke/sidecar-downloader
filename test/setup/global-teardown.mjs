/* eslint-disable @typescript-eslint/no-require-imports */

import { down } from 'docker-compose';

import { join } from 'path';

const __dirname = import.meta.dirname;

export default async () => {
  await down({
    commandOptions: ['--remove-orphans'],
    cwd: join(__dirname),
  });
};
