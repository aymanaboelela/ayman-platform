import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { enrollInDemoCourse, registerAndOnboard, uniqueStudent } from './fixtures';

/**
 * Two checks that `a11y.e2e.ts` structurally CANNOT make, both guarding a
 * defect that had already shipped once.
 *
 * That suite runs axe filtered by WCAG tag
 * (`withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa'])`), and that filter is
 * why neither of these was caught:
 *
 *   1. `label-content-name-mismatch` is tagged `experimental`, and axe excludes
 *      experimental rules from tag-based runs entirely — it appears in neither
 *      violations nor passes nor incomplete. The suite reports zero violations
 *      on a page whose primary control cannot be activated by voice.
 *
 *   2. axe returns `incomplete`, never `violation`, for text over a
 *      `background-image`. The whole `.stage` band is a gradient, so every
 *      string on it is invisible to the colour-contrast rule.
 *
 * Both are therefore asserted directly here rather than left to a suite that
 * is green either way.
 */

test.describe('the study surface', () => {
  test('every control on the public course page can be activated by its visible name', async ({
    page,
  }) => {
    await page.goto('/courses/e2e-demo-course');

    // `withRules` runs the rule REGARDLESS of its tags, which is the whole
    // point — see the docblock.
    const results = await new AxeBuilder({ page })
      .withRules(['label-content-name-mismatch'])
      .analyze();

    // The regression: the cover's play control was named «شغّل «<course>»»
    // while showing «شغّل الكورس». A speech-input user saying what they can
    // read could not press the page's main control (WCAG 2.5.3).
    expect(
      results.violations.flatMap((v) => v.nodes.map((n) => n.html.slice(0, 160))),
    ).toEqual([]);

    // And the rule actually ran against something, so a future refactor that
    // removes every labelled control does not turn this test into a no-op.
    expect(results.passes.length).toBeGreaterThan(0);
  });

  test('text on the course stage clears 4.5:1 against the brightest part of its gradient', async ({
    page,
  }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);

    await page.goto('/library/python-basics');
    await expect(page.locator('.stage').first()).toBeVisible({ timeout: 30_000 });

    const report = await page.evaluate(() => {
      const channels = (css: string) => css.match(/[\d.]+/g)!.map(Number);
      const toUnit = (parts: number[]) => parts.slice(0, 3).map((v) => v / 255);
      const linear = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      const lum = (rgb: number[]) =>
        0.2126 * linear(rgb[0]!) + 0.7152 * linear(rgb[1]!) + 0.0722 * linear(rgb[2]!);
      const ratio = (a: number[], b: number[]) => {
        const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p);
        return (hi + 0.05) / (lo + 0.05);
      };

      /*
       * The worst case is NOT the flat fill — it is the radial highlight's
       * centre stop, which under RTL lands on the top-inline-start corner
       * where the back link and the eyebrow render. That stop is measured by
       * painting it on a probe element rather than hard-coded, so this test
       * follows `--v-stage` wherever it goes instead of pinning a hex that a
       * theme change would silently invalidate.
       */
      const probe = document.createElement('div');
      probe.style.backgroundColor = 'color-mix(in oklch, var(--v-stage), white 6%)';
      document.body.append(probe);
      const worst = toUnit(channels(getComputedStyle(probe).backgroundColor));
      probe.remove();

      const out: Record<string, number> = {};
      for (const selector of ['.stage__eyebrow', '.stage__sub', '.stage__facts', '.stage__back']) {
        const el = document.querySelector(selector);
        if (!el) continue;
        const parts = channels(getComputedStyle(el).color);
        const alpha = parts.length > 3 ? parts[3]! : 1;
        // Composite the (translucent) text over that stop before measuring.
        const over = toUnit(parts).map((v, i) => v * alpha + worst[i]! * (1 - alpha));
        out[selector] = Number(ratio(over, worst).toFixed(2));
      }
      return out;
    });

    // Something must have been measured, or this passes vacuously.
    expect(Object.keys(report).length).toBeGreaterThan(0);

    for (const [selector, value] of Object.entries(report)) {
      // 4.5:1 — these render at `--fs-mono-label` and `--fs-text-sm`, neither
      // of which qualifies as large text. The value that shipped was 2.35:1.
      expect(value, `${selector} on the stage gradient`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
