module.exports = {
  packageManager: 'npm',
  incrementalFile: 'reports/tests/stryker/incremental.json',
  reporters: ['html', 'progress','dashboard'],
  htmlReporter: { fileName: "reports/tests/stryker/index.html"},
  testRunner: 'jest',
  coverageAnalysis: 'perTest',
  disableTypeChecks: '**/*.ts',
  jest: {
    configFile: 'test/jest-unit.js',
  },
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.json',
  incremental: true,
  ignoreStatic: true,
  mutate: [
    'src/**/*.ts',
    '!**/schemas/**',
    '!**/*module.ts',
    '!**/main.ts',
    '!**/local.ts',
  ],
};
