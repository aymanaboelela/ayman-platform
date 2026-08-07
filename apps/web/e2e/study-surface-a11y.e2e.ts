import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { enrollInDemoCourse, registerAndOnboard, uniqueStudent } from './fixtures';

/** The slug `apps/api/prisma/seed-admin.ts` creates — the one course a fresh CI
 *  database is guaranteed to have. `login-gated-content.e2e.ts` hard-codes the
 *  same literal for the same reason. */
const DEMO_COURSE_SLUG = 'e2e-demo-course';

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
    await page.goto(`/courses/${DEMO_COURSE_SLUG}`);

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

    /*
     * And the check is not vacuous — asserted DIRECTLY on the control rather
     * than on axe's `passes` array.
     *
     * `expect(results.passes.length).toBeGreaterThan(0)` was the first attempt
     * and it failed on `mobile` in CI while passing on desktop. The rule only
     * evaluates elements that carry BOTH visible text and an accessible name,
     * so whether it has anything to say about this page depends on which
     * labels the layout renders at a given width — which makes an assertion
     * about `passes` an assertion about the viewport, not about the control.
     *
     * The requirement is one sentence: the accessible name must CONTAIN the
     * visible label. That is true at every width, so it is what gets asserted.
     */
    const play = page.locator('button.course-play__frame');
    await expect(play).toHaveCount(1);
    const [visible, announced] = await play.evaluate((el) => [
      (el.textContent ?? '').trim(),
      el.getAttribute('aria-label') ?? '',
    ]);
    expect(visible.length, 'the play control must have a visible label').toBeGreaterThan(0);
    expect(announced, `«${announced}» must contain «${visible}»`).toContain(visible);
  });

  test('text on the course stage clears 4.5:1 against the brightest part of its gradient', async ({
    page,
  }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);

    // `e2e-demo-course`, NOT a slug that happens to exist locally.
    // `prisma/seed.ts` creates the taxonomy and nothing else; the ONLY course
    // guaranteed on a fresh CI database is the one `seed-admin.ts` makes, which
    // is also the one `enrollInDemoCourse` above just enrolled this student in.
    // A locally-authored course renders fine on the machine it was written on
    // and `notFound()`s in CI, which would fail this as a timeout on `.stage`
    // and read like a styling regression rather than a missing row.
    await page.goto(`/library/${DEMO_COURSE_SLUG}`);
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
       * follows `--e-stage` wherever it goes instead of pinning a hex that a
       * theme change would silently invalidate.
       */
      const probe = document.createElement('div');
      probe.style.backgroundColor = 'color-mix(in oklch, var(--e-stage), white 6%)';
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

  /*
   * The DASHBOARD's band is a second surface with the same problem and one
   * extra layer.
   *
   * `.dash-hero` reuses `.stage`'s gradient recipe verbatim, so the measurement
   * above would seem to cover it — except the band's identity chips
   * («الصف الثالث الثانوي», the track, the school) paint `rgb(255 255 255 /
   * 0.12)` BEHIND their text. That lifts the ground under the very strings the
   * previous test proves are safe on the bare gradient, and it is a worst case
   * nothing else in the product has.
   *
   * Same reason it cannot be left to axe: the band is a `background-image`, so
   * the colour-contrast rule returns `incomplete` and the suite is green either
   * way.
   */
  test('text on the dashboard band clears 4.5:1 — including over the identity chips', async ({
    page,
  }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    await page.goto('/dashboard');
    /*
     * `.first()`, exactly as the stage test above does, and for the reason
     * `fixtures.ts` documents at length: the App Router keeps the OUTGOING
     * segment in the document inside a `display: none` container, so arriving
     * at /dashboard from the onboarding redirect leaves two `.dash-hero`
     * elements mounted and a bare locator is a strict-mode violation.
     *
     * The measurement below is unaffected — it reads `getComputedStyle`, which
     * resolves colours inside a hidden subtree just as well — but the
     * visibility gate has to name which one it means.
     */
    await expect(page.locator('.dash-hero').first()).toBeVisible({ timeout: 30_000 });

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

      // The gradient's brightest stop, painted rather than hard-coded, so this
      // follows `--e-stage` through any future theme change.
      const probe = document.createElement('div');
      probe.style.backgroundColor = 'color-mix(in oklch, var(--e-stage), white 6%)';
      document.body.append(probe);
      const bare = toUnit(channels(getComputedStyle(probe).backgroundColor));
      // And that stop with a chip's own 12% white fill composited on top.
      const chipped = bare.map((v) => 1 * 0.12 + v * 0.88);
      probe.remove();

      const composite = (el: Element, ground: number[]) => {
        const parts = channels(getComputedStyle(el).color);
        const alpha = parts.length > 3 ? parts[3]! : 1;
        const over = toUnit(parts).map((v, i) => v * alpha + ground[i]! * (1 - alpha));
        return Number(ratio(over, ground).toFixed(2));
      };

      const out: Record<string, number> = {};
      for (const selector of ['.dash-hero__eyebrow', '.dash-hero__aside-label']) {
        const el = document.querySelector(selector);
        if (el) out[selector] = composite(el, bare);
      }
      // Measured against the CHIP's ground, not the band's.
      const chip = document.querySelector('.dash-hero__fact');
      if (chip) out['.dash-hero__fact'] = composite(chip, chipped);

      return out;
    });

    /*
     * Two, not three. `completeMinimalOnboarding` fills only what
     * `OnboardingSchema` actually requires — fullName, gender, phone,
     * governorate — and `year` is `.optional()`, so this student may have no
     * identity chip at all and `.dash-hero__fact` is legitimately absent.
     *
     * The eyebrow and the dial's caption are unconditional, so two is the floor
     * that proves the selectors still resolve rather than the assertion passing
     * over an empty object.
     */
    expect(Object.keys(report).length).toBeGreaterThanOrEqual(2);

    for (const [selector, value] of Object.entries(report)) {
      expect(value, `${selector} on the dashboard band`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
