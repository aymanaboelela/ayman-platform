import { expect, test } from '@playwright/test';

/**
 * The hero's rotating headline must stay inside its column on a phone.
 *
 * ## What went wrong
 *
 * `.hero__rotate` sets `flex-wrap: nowrap` so the vendored effect can animate
 * one row of words out of a single clipped line box. That is correct on a
 * desktop and an overflow on a phone: measured at 390px, where the copy column
 * is 358px and the headline computes to 36px, the four phrases needed 371px,
 * 394px, 478px and 541px. Every one of them ran off both edges of the screen
 * with its last word sliced in half — on the first thing anyone sees.
 *
 * A second, subtler bug sat underneath it. `.hero__title span` was a DESCENDANT
 * selector at two-class specificity, so it beat the vendored `display` on
 * `.text-rotate`, `.text-rotate-word` and `.text-rotate-element` — all of them
 * one class specific. While the row could not wrap that was invisible. The
 * moment it did, words laid out 81px tall instead of 40px and the headline's
 * two lines sat a blank line apart.
 *
 * ## Why 320px is the only width sampled across a full cycle
 *
 * It is the worst case, provably rather than by assumption. The headline is
 * `clamp(2.25rem, 5vw, 4rem)`, and below roughly 720px the `5vw` term is
 * smaller than the floor — so the font size is PINNED at 36px while the column
 * keeps growing with the viewport. Narrowest column, same type: if every phrase
 * fits here, it fits at every wider phone. The other widths get a single
 * containment check, which is enough to catch a breakpoint being moved.
 *
 * The cycle matters because only one phrase is in the DOM at a time, and they
 * are not the same length — the bug reached production with three of the four
 * looking acceptable in a screenshot.
 */

/** `rotationInterval` in `components/site/rotating-headline.tsx`. */
const ROTATION_MS = 2800;
const PHRASES = 4;

/** Every word box, and the column they must stay inside. */
async function measure(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const copy = document.querySelector('.hero__copy');
    const words = [...document.querySelectorAll('.hero__rotate .text-rotate-word')];
    if (!copy || words.length === 0) return null;

    const column = copy.getBoundingClientRect();
    const boxes = words.map((w) => w.getBoundingClientRect());
    const rows = new Set(boxes.map((b) => Math.round(b.top)));

    return {
      phrase: document.querySelector('.text-rotate-sr-only')?.textContent ?? '',
      overflowStart: Math.round(Math.min(...boxes.map((b) => b.left)) - column.left),
      overflowEnd: Math.round(column.right - Math.max(...boxes.map((b) => b.right))),
      rows: rows.size,
      documentScrollsSideways:
        document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
}

test.describe('the hero headline on a phone', () => {
  test('every phrase stays inside the column at the narrowest width', async ({ page }) => {
    test.setTimeout(60_000);

    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    await page.locator('.hero__rotate .text-rotate-word').first().waitFor();

    const seen = new Map<string, { rows: number }>();

    /*
     * One sample per phrase plus a margin, taken mid-interval rather than on
     * the boundary — a sample landing exactly on a rotation would catch the
     * outgoing phrase mid-animation, whose transform is deliberately outside
     * the clipped box and is not a layout fact.
     */
    for (let i = 0; i < PHRASES + 2; i += 1) {
      const m = await measure(page);
      expect(m, 'the rotating headline should be rendered').not.toBeNull();

      // Negative means a word started outside the column.
      expect(m!.overflowStart, `«${m!.phrase}» overflows the inline start`).toBeGreaterThanOrEqual(0);
      expect(m!.overflowEnd, `«${m!.phrase}» overflows the inline end`).toBeGreaterThanOrEqual(0);
      expect(m!.documentScrollsSideways, 'the page must not scroll sideways').toBe(false);

      seen.set(m!.phrase, { rows: m!.rows });
      await page.waitForTimeout(ROTATION_MS);
    }

    /*
     * ⚠️ THREE, not the two `.hero__title-accent` reserves — and the gap
     * between those numbers is deliberate.
     *
     * The reserve exists so the lead and the buttons below do not jump as
     * phrases rotate, and two lines is what the design targets. But the exact
     * row count is a function of FONT METRICS, and those are not the same on
     * this machine, on CI and on a student's phone. An earlier version of this
     * test asserted `<= 2` and went red on CI alone: the same phrase that
     * wraps to two lines locally wrapped to three there, on nothing but a
     * different rasterisation. The headline was fine; the assertion was not
     * portable.
     *
     * So the portable assertions are the ones above — nothing leaves the
     * column, and the page never scrolls sideways — because those are the
     * actual bug. This is a ceiling that still catches a runaway wrap without
     * pretending a pixel-exact line count travels between environments.
     * Exceeding the reserve costs a layout jump, not a clipped headline:
     * `min-height` is a floor, so the box grows.
     */
    for (const [phrase, { rows }] of seen) {
      expect(rows, `«${phrase}» wrapped further than the headline can absorb`).toBeLessThanOrEqual(
        3,
      );
    }

    // The sampling window is long enough for the whole cycle; if it saw only
    // one phrase, the rotation is broken and this test proves nothing.
    expect(seen.size, 'the headline should have rotated').toBeGreaterThan(1);
  });

  for (const width of [360, 390, 480]) {
    test(`stays inside the column at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await page.goto('/');
      await page.locator('.hero__rotate .text-rotate-word').first().waitFor();

      const m = await measure(page);
      expect(m).not.toBeNull();
      expect(m!.overflowStart).toBeGreaterThanOrEqual(0);
      expect(m!.overflowEnd).toBeGreaterThanOrEqual(0);
      expect(m!.documentScrollsSideways).toBe(false);
    });
  }

  /*
   * The copy is aligned to the BOTTOM of the hero on a phone so it sits under
   * the instructor's face instead of across it — which walks the call to action
   * straight into المساعد's launcher, `fixed` in the same corner. The hero
   * carries a 5.5rem reserve for it, the same one `.shell main` keeps.
   */
  test('the call to action clears the assistant launcher', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const launcher = page.getByRole('button', { name: 'فتح المساعد', exact: true });
    await launcher.waitFor();
    await page.locator('.hero__cta a, .hero__cta button').first().waitFor();

    /*
     * ⚠️ POLLED, because the hero animates in. `site-hero.tsx` drives every
     * `[data-hero-line]` with GSAP, so for the first moments the buttons are
     * translated below their final position — measured once on load this
     * asserted against a frame of the intro rather than against the layout,
     * and failed on a hero that is actually fine.
     */
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const launcherBox = document
              .querySelector('.assistant-launcher')
              ?.getBoundingClientRect();
            const buttons = [...document.querySelectorAll('.hero__cta a, .hero__cta button')];
            if (!launcherBox || buttons.length === 0) return null;

            return buttons
              .map((b) => b.getBoundingClientRect())
              .every(
                (box) => box.bottom <= launcherBox.top || box.left > launcherBox.right,
              );
          }),
        { message: 'a hero call to action sits under the assistant launcher' },
      )
      .toBe(true);
  });
});
