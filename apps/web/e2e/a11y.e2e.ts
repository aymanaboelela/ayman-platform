import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Every route reachable without a session, as they actually exist in this
 * repo today -- kept in sync BY HAND, since a route that is public and not
 * listed here is exactly the one that will regress silently.
 *
 * The Task 15 brief's original list (`/about`, `/contact`) does not match
 * this codebase; there is no about/contact page anywhere under `app/`.
 * `/courses/e2e-demo-course` is the seeded demo course from
 * `apps/api/prisma/seed-admin.ts` -- present whenever that script has run,
 * skipped gracefully (via a 404 check, not a hard failure) otherwise.
 *
 * `/years/1` and `/essentials` landed with the 2026-07-29 marketing rebuild.
 * `/years/[year]` is checked at one value only: the three years render the
 * same component with a different filter, so a second entry would triple the
 * runtime to re-test identical markup.
 */
const PUBLIC_ROUTES = [
  '/',
  '/courses',
  '/years/1',
  '/essentials',
  '/login',
  '/register',
] as const;

/**
 * Task-15's finding — `apps/web/app/(auth)/{login,register}/page.tsx`
 * rendered the register/login switch link as `className="text-accent-text
 * hover:underline"`, underlined only on hover, so at rest it was
 * distinguished from the surrounding paragraph by colour alone (WCAG 1.4.1,
 * axe rule `link-in-text-block`) — FIXED as part of the 2026-07-27 audit
 * fixes (dropped `hover:`, so the link is underlined at rest). No entries
 * remain: this map stays empty on purpose so a real regression on either
 * route fails loudly instead of being silently re-excused.
 */
const KNOWN_FINDINGS: Record<string, string[]> = {};

for (const route of PUBLIC_ROUTES) {
  test.describe(`a11y ${route}`, () => {
    test('has no serious or critical axe violations', async ({ page }, testInfo) => {
      // Audit the page at REST, not mid-entrance. The marketing surface fades
      // its hero and section content in from `opacity: 0`, and axe sampling
      // during that window reports contrast failures for text that is simply
      // part-way through appearing — the suite was intermittently red for it.
      //
      // Reduced motion is the right lever rather than a sleep: every entrance
      // animation is a `gsap.from()` that is skipped entirely under this
      // setting (see `components/motion/use-gsap.ts`), so the DOM lands
      // directly in the exact state the animation would have finished at.
      // Nothing is excluded from the audit — only the transition to it.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(route);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const known = new Set(KNOWN_FINDINGS[route] ?? []);
      const blocking = results.violations.filter(
        (violation) =>
          (violation.impact === 'serious' || violation.impact === 'critical') &&
          !known.has(violation.id),
      );

      // Attach the full report even on success -- the moderate/minor findings
      // (and the known-but-out-of-scope ones filtered out above) are the
      // backlog, and they are invisible if only failures are recorded.
      await testInfo.attach(`axe-${route.replace(/\//g, '_') || 'root'}.json`, {
        body: JSON.stringify(results.violations, null, 2),
        contentType: 'application/json',
      });

      expect(
        blocking.map((v) => `${v.id}: ${v.nodes.length} node(s) -- ${v.help}`),
      ).toEqual([]);
    });

    test('declares Arabic and RTL on the document element', async ({ page }) => {
      await page.goto(route);
      // Getting this wrong is a total accessibility failure for the entire
      // audience, and it is invisible to a sighted developer.
      await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    });

    test('keeps every interactive target reachable by keyboard', async ({ page }) => {
      await page.goto(route);
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => document.activeElement?.tagName ?? null);
      expect(focused).not.toBe('BODY');
      // The tokenised focus ring must actually paint -- outline:none with no
      // replacement is the most common regression in a design-token refactor.
      const outline = await page.evaluate(
        () => getComputedStyle(document.activeElement!).outlineWidth,
      );
      expect(outline).not.toBe('0px');
    });
  });
}

test.describe('a11y /courses/e2e-demo-course (seeded course detail)', () => {
  test('has no serious or critical axe violations, if the seed has run', async ({ page }, testInfo) => {
    const response = await page.goto('/courses/e2e-demo-course');
    // Soft-skip rather than fail: this route only exists after
    // `prisma/seed-admin.ts` has run against the target database (Task 14).
    test.skip(response?.status() === 404, 'seeded demo course not present -- run seed-admin.ts first');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );
    await testInfo.attach('axe-courses-e2e-demo-course.json', {
      body: JSON.stringify(results.violations, null, 2),
      contentType: 'application/json',
    });
    expect(blocking.map((v) => `${v.id}: ${v.nodes.length} node(s) -- ${v.help}`)).toEqual([]);
  });
});
