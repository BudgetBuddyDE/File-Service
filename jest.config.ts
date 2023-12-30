import {type Config} from 'jest';

const JestConfig: Config = {
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setupTests.ts'],
  transform: {
    '^.+\\.ts?$': 'ts-jest',
  },
  testEnvironment: 'node',
  testRegex: '\\.(test|spec)\\.(ts)?$',
  moduleFileExtensions: ['ts', 'js'],
  // silent: true,
  globals: {
    'process.env': {
      // UPLOAD_DIR: 'testfiles',
      // NODE_ENV: 'test',
    },
  },
};

module.exports = JestConfig;
