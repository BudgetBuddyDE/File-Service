import {type Config} from 'jest';

const JestConfig: Config = {
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setupTests.ts'],
  transform: {
    '^.+\\.ts?$': 'ts-jest',
  },
  // collectCoverage: true,
  // coverageThreshold: {
  //   global: {
  //     statements: 90,
  //     branches: 90,
  //     functions: 90,
  //     lines: 90,
  //   },
  // },
  testEnvironment: 'node',
  testRegex: '\\.(test|spec)\\.(ts)?$',
  moduleFileExtensions: ['ts', 'js'],
  silent: true,
  // globals: {
  //   'process.env': {
  //     // PORT: 9080,
  //     // UPLOAD_DIR: 'testfiles',
  //     // NODE_ENV: 'test',
  //   },
  // },
};

module.exports = JestConfig;
