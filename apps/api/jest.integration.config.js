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
  /*
   * `jose` is on this allow-list — it is the ONLY entry here that is not an
   * HTML-parsing dependency, and it is here because jose 6 ships `dist/webapi`
   * and nothing else: pure ESM, `"type": "module"`, no CommonJS build. swc
   * compiles this suite to CommonJS, so an untransformed `require('jose')`
   * dies on the first `export` keyword with `SyntaxError: Unexpected token
   * 'export'` — pointing at OUR spec's first line, never at jose.
   *
   * It became reachable when `common/entitlements.ts` started verifying the
   * signed feature document, which `TenantEntitlementsModule` pulls into this
   * matrix. Before that, jose's only importer was `auth/auth.config.ts`, which
   * no spec loads — which is why this was green while being wrong.
   *
   * The same line exists in the unit config (`package.json`), where it cannot
   * carry this comment.
   */
  transformIgnorePatterns: [
    'node_modules/\\.pnpm/(?!(htmlparser2|domhandler|domutils|domelementtype|dom-serializer|entities|jose)@)',
  ],
  testEnvironment: 'node',
  // Real network round-trips plus Argon2 verification in the auth matrix.
  testTimeout: 30000,
  maxWorkers: 1,
};
