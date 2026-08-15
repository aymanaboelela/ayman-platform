import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { copy } from '@ayman/contracts';

/**
 * The 404 screens.
 *
 * ## What this suite is guarding against
 *
 * Until 2026-08-15 the app shipped **no `not-found.tsx` on any surface**, so
 * every unmatched URL was answered by Next's built-in page. Measured on
 * production that day at `/this-does-not-exist`:
 *
 *     404 | This page could not be found.
 *
 * English, LTR, no stylesheet, no nav, no footer, no link out — on a site
 * where every other screen is Egyptian Arabic. Nothing failed and nothing was
 * logged, which is exactly why it survived: the route table was correct, the
 * tests were green, and the only way to see it was to open a wrong URL.
 *
 * So the assertions below are deliberately about the CONTENT of the 404, not
 * merely about its status code. A suite that only checked `status() === 404`
 * would have passed against the broken build too.
 */

/**
 * `dir` is set on `<html>` by the root layout. Asserting it on the 404 is not
 * redundant: Next's built-in page replaces the whole body, and the failure this
 * suite exists for was a page that inherited none of the document's Arabic
 * typography. If a future refactor reintroduces a bare fallback, this catches
 * it even if the copy assertion is somehow satisfied.
 */
async function expectArabicShell(page: import('@playwright/test').Page) {
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', /^ar/);
  // The literal string from Next's built-in page. It must appear NOWHERE.
  await expect(page.locator('body')).not.toContainText('This page could not be found');
}

test.describe('404 — unmatched URL', () => {
  test('answers 404 and renders the Arabic backstop, not Next’s English page', async ({ page }) => {
    const response = await page.goto('/this-route-does-not-exist');

    // A URL matching no route never enters a route group, so this is
    // `app/not-found.tsx` — the only one of the four that can catch it.
    expect(response?.status()).toBe(404);

    await expectArabicShell(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.notFound.root.title);
  });

  test('offers exactly one way out, and it goes home', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');

    const cta = page.getByRole('link', { name: copy.notFound.root.cta });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', '/');

    // No retry control anywhere on a 404. `error.tsx` has one because a throw
    // may be transient; a 404 is a fact about the URL, and a button that
    // re-runs it is the «اضغط تاني وما يحصلش حاجة» screen this project has
    // been explicitly asked not to ship.
    await expect(page.getByRole('button', { name: copy.common.retry })).toHaveCount(0);
  });

  test('the way out actually works', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    await page.getByRole('link', { name: copy.notFound.root.cta }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });

  test('has no accessibility violations', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});

/**
 * A route that MATCHES and then calls `notFound()` because the record is
 * missing. This selects the route group's own `not-found.tsx`, so it is a
 * different file from the one above and needs its own coverage.
 *
 * ⚠️ The status code is asserted as 200 here, on purpose, and that is not an
 * endorsement. `next.config.ts` sets `cacheComponents: true`, so these routes
 * stream a prerendered shell and the status line is committed BEFORE the
 * dynamic segment runs `notFound()`. Measured on production 2026-08-15:
 * `/courses/no-such-course` → 200 with `x-nextjs-postponed: 1`, while
 * correctly rendering the not-found UI.
 *
 * The assertion is written to the behaviour that exists so the suite tells the
 * truth. If the soft-404 is fixed later — by settling the slug in `proxy.ts`,
 * or by taking these routes dynamic — this expectation is the one to update,
 * and it is deliberately a single line so that is easy.
 */
test.describe('404 — record that does not exist', () => {
  test('a dead course slug renders the site 404 inside the marketing shell', async ({ page }) => {
    const response = await page.goto('/courses/definitely-not-a-real-course');

    // Soft 404: see the note above. Not 404 — PPR already sent the shell.
    expect(response?.status()).toBe(200);

    await expectArabicShell(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.notFound.site.title);

    // The marketing shell is still around it — this is the group's boundary,
    // not the bare backstop. The footer is rendered by `(site)/layout.tsx`.
    await expect(page.locator('footer')).toBeVisible();
  });

  test('sends the visitor to the catalogue, which is where the course was', async ({ page }) => {
    await page.goto('/courses/definitely-not-a-real-course');

    /*
     * Scoped to `<main>`, and it has to be: this 404 renders INSIDE the
     * marketing shell, and both the site nav and the footer carry their own
     * «كل الكورسات» link. An unscoped `getByRole` matched 2-3 elements and
     * failed on strict mode — the page was correct, the locator was not.
     *
     * Scoping is also the better assertion. What matters is that the 404's own
     * body offers the way out; a nav link that is on every page of the site
     * would satisfy a page-wide locator while the 404 itself was a dead end.
     */
    const cta = page.getByRole('main').getByRole('link', { name: copy.notFound.site.cta });
    await expect(cta).toHaveAttribute('href', '/courses');

    await cta.click();
    await expect(page).toHaveURL(/\/courses$/);
  });

  test('a year outside 1–3 is a 404, not an empty listing', async ({ page }) => {
    await page.goto('/years/9');
    await expectArabicShell(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.notFound.site.title);
  });

  test('a non-numeric year segment is a 404 too', async ({ page }) => {
    await page.goto('/years/abc');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.notFound.site.title);
  });

  test('an unpublished article does not confirm its own existence', async ({ page }) => {
    await page.goto('/news/no-such-article');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.notFound.site.title);
  });
});
