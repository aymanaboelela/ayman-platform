import { expect, test } from '@playwright/test';

/**
 * The marketing header carries five things in one row — the portrait mark, the
 * wordmark, the theme pill and both auth buttons — and it does not fit at every
 * width. Two breakpoints do the rationing (see `.site-mark` in
 * `app/(site)/styles/sections.css`):
 *
 *   · ≤704px — the wordmark is dropped and the mark stands in as the logo.
 *   · ≤359px — the mark goes too, leaving exactly the row that shipped before
 *     the portrait existed.
 *
 * Both thresholds are MEASURED, not chosen, and that is precisely why they need
 * a test: nothing about the CSS explains why 44rem, so the next person to add
 * a nav control has no way to know they have overrun it. When that happens the
 * failure is not subtle-but-harmless — the login pair is pushed off the
 * inline-start edge of the card (it sat at -161px at 481px before this was
 * fixed) and is simply unreachable, on the two buttons the funnel depends on.
 *
 * The band above the mobile breakpoint is the one that regressed unnoticed for
 * real: 481–704px overflowed on its own, before any portrait was involved.
 * Phone and desktop both looked fine, so nothing caught it.
 */

/** `true` where the element must be rendered AND occupy space. */
type Expectation = { width: number; mark: boolean; wordmark: boolean };

/**
 * The boundaries and one width either side of each, rather than a sweep: the
 * rules are pure `max-width` media queries, so a failure can only appear where
 * one of them switches. 320 is the narrowest phone the nav is designed for and
 * 360 is the most common Android viewport there is — the pair that makes the
 * odd 22.4375rem threshold worth keeping.
 */
const EXPECTATIONS: Expectation[] = [
  { width: 320, mark: false, wordmark: false },
  { width: 359, mark: false, wordmark: false },
  { width: 360, mark: true, wordmark: false },
  { width: 390, mark: true, wordmark: false },
  { width: 480, mark: true, wordmark: false },
  { width: 600, mark: true, wordmark: false },
  { width: 704, mark: true, wordmark: false },
  { width: 705, mark: true, wordmark: true },
  { width: 1440, mark: true, wordmark: true },
];

test.describe('site nav lockup', () => {
  // One project only. Every case sets its own viewport, so running the same
  // widths again under Pixel 7 would re-measure identical layouts.
  //
  // In `beforeEach` rather than as a describe-level condition: the callback
  // form of `test.skip` is handed fixtures alone, so reaching for `testInfo`
  // there throws at collection time and takes the whole file down with it.
  //
  // The empty `{}` is required, not stylistic — Playwright parses the first
  // parameter to work out which fixtures a hook wants, and rejects any name
  // that is not a destructuring pattern at collection time.
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'viewport is set per-case');
  });

  for (const { width, mark, wordmark } of EXPECTATIONS) {
    test(`fits at ${width}px, with mark=${mark} wordmark=${wordmark}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');

      // The PINNED state is the one to measure: it floats as a card with a
      // margin, so its inner box is narrower than the full-bleed state over the
      // hero. Anything that fits pinned fits over.
      await page.evaluate(() => window.scrollTo(0, 1400));
      const nav = page.locator('header.site-nav');
      await expect(nav).toHaveAttribute('data-pinned', 'true');

      const mediaMatches = await page.evaluate(() => {
        const inner = document.querySelector('.site-nav__inner')!;
        const end = document.querySelector('.site-nav__end')!.getBoundingClientRect();
        const visible = (selector: string) => {
          const el = document.querySelector(selector);
          return !!el && el.getBoundingClientRect().width > 0;
        };
        return {
          overflow: inner.scrollWidth - inner.clientWidth,
          endLeft: Math.round(end.left),
          mark: visible('.site-mark'),
          wordmark: visible('.site-nav .wordmark'),
        };
      });

      // The row must not be wider than the card that holds it...
      expect(mediaMatches.overflow).toBe(0);
      // ...and the auth buttons must not have been pushed off the edge. This is
      // the assertion that would have caught the 481–704px regression; the
      // overflow check alone can pass while content is merely clipped.
      expect(mediaMatches.endLeft).toBeGreaterThanOrEqual(0);

      expect(mediaMatches.mark).toBe(mark);
      expect(mediaMatches.wordmark).toBe(wordmark);
    });
  }

  test('keeps the brand named for assistive tech once the wordmark is hidden', async ({ page }) => {
    // At 390px the visible name is gone and only the portrait remains. The
    // portrait is `alt=""` by design, so if the anchor ever loses its label the
    // header stops announcing the brand at all — silently, and only on phones.
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/');

    await expect(page.locator('.site-nav .wordmark')).toBeHidden();
    await expect(page.locator('.site-nav__logo')).toHaveAttribute('aria-label', /\S/);
  });
});
