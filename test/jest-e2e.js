const sharedConfig = require('../jest.config.json');

module.exports = {
  ...sharedConfig,
  rootDir: '..',
  coverageDirectory: '<rootDir>/reports/tests/e2e/coverage',
  coveragePathIgnorePatterns: [...sharedConfig.coveragePathIgnorePatterns],
  testRegex: '\\.e2e-spec\\.ts$',
  testTimeout: 2000,
  globalSetup: '<rootDir>/test/setup/global-setup.mjs',
  globalTeardown: '<rootDir>/test/setup/global-teardown.mjs',
};
