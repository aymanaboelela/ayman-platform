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

  /**
   * Both viewports locally and on `main`; desktop only on a pull request.
   *
   * ## Why, in minutes
   *
   * This suite is ~120 tests and takes about 13 minutes per project. Running
   * both on every push to every PR is 26 minutes a go, and a PR that gets
   * rebased three times because `main` moved underneath it pays that three
   * times over. On 2026-08-04 this repository burned its entire monthly Actions
   * allowance — 3,237 of 3,000 minutes — and the deploy job then failed in four
   * seconds with no steps, because there were no minutes left to run it. Six
   * pull requests did that, and the largest single line item was this matrix.
   *
   * ## Why dropping `mobile` from PRs is safe, and where it is not
   *
   * It is NOT free: mobile-only bugs are real and this repository has shipped
   * several — a rail assertion that passed on desktop and failed on a phone, a
   * strict-mode violation that only appeared at the narrow viewport because it
   * hydrates later. Those are exactly the ones a desktop-only PR run would miss.
   *
   * What makes it acceptable is that `main` still runs BOTH before anything
   * deploys, so nothing reaches production unverified — the feedback simply
   * arrives at merge time instead of at review time. That is the honest
   * trade: slower to learn about a mobile regression, half the cost to learn
   * about everything else.
   *
   * Run both locally before pushing anything that touches layout:
   *     pnpm --filter @ayman/web exec playwright test
   * with no `--project`, which is what this config does off CI.
   *
   * `PLAYWRIGHT_ALL_PROJECTS=1` forces the full matrix on a PR when a change
   * warrants it. Set it on the workflow, not in a commit.
   */
  projects:
    process.env.CI && process.env.GITHUB_REF !== 'refs/heads/main' && !process.env.PLAYWRIGHT_ALL_PROJECTS
      ? [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }]
      : [
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
    },
  ],
});
