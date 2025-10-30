import type { Config } from 'jest';

const config: Config = {
  rootDir: '..',
  testMatch: ['**/e2e/**/*.spec.ts'],
  preset: 'ts-jest',
  testEnvironment: 'node',
  maxWorkers: 1,
  testTimeout: 120000,
};
export default config;
