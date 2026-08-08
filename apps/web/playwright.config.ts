import { defineConfig, devices } from '@playwright/test';

/**
 * `*.e2e.ts`, NOT `*.spec.ts` — `vitest.config.ts`'s own comment already
 * documents `*.e2e.ts` as Playwright's glob and `apps/api`'s `*.spec.ts` as
 * Jest's, so the three runners never fight over a file. The two
 * pre-existing specs (`quiz.spec.ts`, `admin.spec.ts`) predate this config
 * and use Playwright's literal default naming (also excluded from both
 * `vitest.config.ts`'s include and `tsconfig.json`'s `e2e` exclude already);
 * `testMatch` below picks up BOTH suffixes so they run too rather than being
 * silently ignored.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /e2e\/.*\.(e2e|spec)\.ts$/,
  fullyParallel: false, // one shared database and one shared demo course/quiz
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://localhost:3200',
    // The product is Arabic-only and RTL. Running the browser in any other
    // locale hides bidi bugs that only appear under a real RTL UA.
    locale: 'ar-EG',
    timezoneId: 'Africa/Cairo',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  /**
   * Both servers, in the single-origin arrangement the app assumes: the
   * browser only ever touches :3200, which rewrites /api to :3300. Pointing
   * Playwright at :3300 directly would test a topology that does not exist.
   * `reuseExistingServer` outside CI so a developer's already-running `pnpm
   * dev` is used rather than fighting it for the port.
   */
  webServer: [
    {
      command: 'pnpm --filter @ayman/api run start',
      url: 'http://localhost:3300/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'pnpm --filter @ayman/web run start',
      url: 'http://localhost:3200',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      /**
       * ENFORCED, not report-only — and this is a bug fix, not a hardening
       * exercise.
       *
       * `proxy.ts` sends `Content-Security-Policy-Report-Only` unless
       * `CSP_ENFORCE` is set, and production sets it. So every test in this
       * suite ran under a policy that reports violations and permits them,
       * which makes the entire suite blind to the one class of bug that can
       * only appear in production.
       *
       * It cost the JavaScript playground: `runCode` started its worker from a
       * `blob:` URL, which inherits the document's `script-src` — and that has
       * `'wasm-unsafe-eval'` (for Pyodide) but deliberately not `'unsafe-eval'`.
       * `new Function` therefore threw on every run, and «شغّل» printed the CSP
       * error where the student's output should have been. Locally it worked,
       * because `buildPublicCsp` adds `'unsafe-eval'` under `dev`; in CI it
       * worked, because nothing was enforced. Only the live site was broken.
       *
       * With this set, every existing test is also a CSP test — a violation
       * that breaks a feature now breaks a test.
       */
      env: { ...process.env, CSP_ENFORCE: 'true' },
    },
  ],
});
