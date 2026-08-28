import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './fixtures';

/**
 * A page whose chunk cannot evaluate recovers by itself, exactly once.
 *
 * The condition is the real one from 2026-08-18: a tab holding Turbopack module
 * ids from an older build, where the module that now exports
 * `partialWithoutDefaults` exported nothing. `packages/contracts/src/partial.ts`
 * is module 83803 (re-measured 2026-08-28 — it was 903896 when this test was
 * written; a night of new files added elsewhere under `packages/contracts/src`
 * shifted it, exactly the drift this file's own warning below describes.
 * Confirmed stable across two independent clean `next build` runs of the same
 * tree, so this is not per-build noise); registering an export-less factory
 * for that id first is what every browser open across that deploy effectively
 * had.
 *
 * The registration is re-injected on EVERY document load, so the reload cannot
 * cure it — which is the point. It proves the bound: one reload, then the error
 * screen, never a loop. See `reloadOnceFor` in `lib/use-error-retry.ts`.
 *
 * ⚠️ Like `skew-check.e2e.ts`, this asserts the stale factory actually WON —
 * `documentLoads` must hit 2. A rename of `partial.ts` (or of anything else
 * that shifts Turbopack's id allocation) leaves this test registering an id
 * nothing imports: `documentLoads` stays 1, which looks like "no crash" but
 * is the FAILURE mode here, and the test is silently testing nothing. Verify
 * the real id against a production build before ever changing this number.
 */
const EXPORTLESS_PARTIAL =
  'function(e){"use strict";e.i(817422),e.s([])}';

test('reloads once when a module fails to evaluate, then stops', async ({ page }) => {
  await loginAsAdmin(page);

  await page.addInitScript(
    `(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["static/chunks/stale-build.js",83803,${EXPORTLESS_PARTIAL}]);`,
  );

  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text().slice(0, 200));
  });

  let documentLoads = 0;
  page.on('load', () => {
    documentLoads += 1;
  });

  await page.goto('/admin/courses/new');
  await page.waitForLoadState('networkidle');
  // Long enough for a second reload to have happened if the bound were missing.
  await page.waitForTimeout(3_000);

  expect(
    errors.join('\n'),
    'the stale registration never broke the page, so this test proves nothing',
  ).toContain('is not a function');

  // The `goto` itself, plus exactly one automatic recovery attempt.
  expect(documentLoads).toBe(2);

  // And it settled on the error screen rather than reloading forever.
  await expect(page.getByRole('button', { name: 'نحاول تاني' })).toBeVisible();
});
