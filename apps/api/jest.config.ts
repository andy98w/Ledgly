export default {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  collectCoverageFrom: ['**/*.service.ts'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  testTimeout: 60_000,
  moduleNameMapper: { '^src/(.*)$': '<rootDir>/$1' },
};
