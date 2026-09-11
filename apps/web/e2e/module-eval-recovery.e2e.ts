import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './fixtures';

/**
 * A page whose chunk cannot evaluate recovers by itself, exactly once.
 *
 * The condition is the real one from 2026-08-18: a tab holding Turbopack module
 * ids from an older build, where the module that now exports
 * `partialWithoutDefaults` exported nothing. `packages/contracts/src/partial.ts`
 * is module 903896; registering an export-less factory for that id first is
 * what every browser open across that deploy effectively had.
 *
 * The registration is re-injected on EVERY document load, so the reload cannot
 * cure it — which is the point. It proves the bound: one reload, then the error
 * screen, never a loop. See `reloadOnceFor` in `lib/use-error-retry.ts`.
 */
const EXPORTLESS_PARTIAL =
  'function(e){"use strict";e.i(817422),e.s([])}';

test('reloads once when a module fails to evaluate, then stops', async ({ page }) => {
  await loginAsAdmin(page);

  await page.addInitScript(
    `(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["static/chunks/stale-build.js",903896,${EXPORTLESS_PARTIAL}]);`,
  );

  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text().slice(0, 200));
  });

  /*
   * ⚠️ NOT `page.on('load')`, which is what this counted first and is a race
   * it can never win.
   *
   * `load` only fires once a document has finished fetching every subresource.
   * The recovery runs from a `useEffect` the moment the error boundary mounts —
   * roughly 190ms in, routinely BEFORE `load` — and `location.reload()` then
   * ABORTS the first document, so its `load` never fires at all. The counter
   * reads 1 for a recovery that worked perfectly, and the test fails on a
   * success.
   *
   * It only shows up when the runner is slow enough to widen that window,
   * which is why it sat green for weeks and then failed twice in one evening
   * on CI (run 34633191088 — two `POST /api/errors` 188ms apart, i.e. two
   * boundary renders and therefore two documents, against one `load` event).
   *
   * The navigation REQUEST is the right event: it is issued before anything
   * can abort it, it never waits on subresources, and — unlike
   * `framenavigated` — it does not also fire for same-document History API
   * navigations, so a `replaceState` during hydration cannot inflate the count
   * to three.
   */
  let documentLoads = 0;
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      documentLoads += 1;
    }
  });

  await page.goto('/admin/courses/new');

  /*
   * POLLED, not measured once after a fixed wait — and that is the second half
   * of this test's flakiness, independent of the counter above.
   *
   * The old shape was `waitForLoadState('networkidle')` plus a flat
   * `waitForTimeout(3_000)`, then one assertion. That budget is not a bound on
   * anything real: a recovery that is merely LATE — a throttled runner, a cold
   * JIT — fails it exactly like a recovery that never came. Reproduced
   * deliberately at 45-55x CPU throttle, which yields `documentLoads` of 1
   * with the console error present: CI's signature precisely.
   *
   * `networkidle` is gone too. It has no bearing on when the reload happens
   * and it blocked for 26 seconds on the run that failed.
   *
   * The console assertion is polled FIRST on purpose: if the injected module
   * id ever stops resolving to `partial.ts`, the page never breaks, and this
   * says so in as many words instead of degrading into a baffling
   * «Expected 2, Received 1» from the reload poll below.
   */
  await expect
    .poll(() => errors.join('\n'), {
      timeout: 15_000,
      message: 'the stale registration never broke the page, so this test proves nothing',
    })
    .toContain('is not a function');

  // The `goto` itself, plus exactly one automatic recovery attempt. See the
  // counter above for why this counts navigation requests.
  await expect
    .poll(() => documentLoads, { timeout: 15_000, message: 'the recovery reload never arrived' })
    .toBe(2);

  // Only NOW is a flat wait meaningful: the recovery has happened, and this is
  // the window in which a SECOND one would show up if the bound were missing.
  await page.waitForTimeout(3_000);
  expect(documentLoads, 'it reloaded more than once').toBe(2);

  // And it settled on the error screen rather than reloading forever.
  await expect(page.getByRole('button', { name: 'نحاول تاني' })).toBeVisible();
});
