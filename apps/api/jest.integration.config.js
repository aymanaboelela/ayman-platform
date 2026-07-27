/**
 * Integration tests run against the real local Postgres and Redis.
 *
 * They are a separate suite because they are the only tests with external
 * prerequisites — `pnpm test` must stay runnable with nothing installed.
 * The naming convention is `*.int-spec.ts`, which the unit config's
 * `.*\.spec\.ts$` regex deliberately does NOT match (`-spec` ≠ `.spec`).
 *
 * A shared Postgres and one Redis keyspace cannot take parallel workers
 * without cross-test interference — `maxWorkers: 1`, same discipline as the
 * unit config (its own comment: 8 tests failed under parallel workers and
 * passed serially).
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.int-spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      '@swc/jest',
      {
        sourceMaps: true,
        module: { type: 'commonjs' },
        jsc: {
          parser: { syntax: 'typescript', decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          target: 'es2023',
          keepClassNames: true,
          baseUrl: './',
        },
      },
    ],
  },
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transformIgnorePatterns: [
    'node_modules/\\.pnpm/(?!(htmlparser2|domhandler|domutils|domelementtype|dom-serializer|entities)@)',
  ],
  testEnvironment: 'node',
  // Real network round-trips plus Argon2 verification in the auth matrix.
  testTimeout: 30000,
  maxWorkers: 1,
};
