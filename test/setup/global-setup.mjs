/* eslint-disable @typescript-eslint/no-require-imports */

import { join } from 'path';

import { exec, upAll } from 'docker-compose';
import isPortReachable from 'is-port-reachable';

const __dirname = import.meta.dirname;

// type Dependency = {
//     isAvailable: () => Promise<boolean>;
//     readiness: () => Promise<void>;
//     setup?: () => Promise<void>;
// };

const DEPENDENCIES = {
}

export default async () => {
  console.time('global-setup');
  const isAvailables = await Promise.all(Object.values(DEPENDENCIES).map((dependency) => dependency.isAvailable()));
  if (isAvailables.some((isAvailable) => !isAvailable)) {
    console.log('\nStarting up dependencies please wait...\n');
    await upAll({
      cwd: join(__dirname),
      log: true,
    });

    await Promise.all(Object.values(DEPENDENCIES).map((dependency) => dependency.readiness()));
  }

  console.log('\nSetting up dependencies please wait...\n');
  await Promise.all(Object.values(DEPENDENCIES).filter((dependency) => dependency.setup).map((dependency) => dependency.setup()));

  console.timeEnd('global-setup');
};
