import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { copy } from '@ayman/contracts';
import {
  completeMinimalOnboarding,
  enrollInDemoCourse,
  register,
  uniqueStudent,
} from './fixtures';

/**
 * The learning-path screen, in a real browser.
 *
 * The GATE RULE itself is covered far more thoroughly elsewhere — 25 pure
 * cases in `gate-rule.spec.ts` and 11 end-to-end through the real service and
 * a real database in `gate-enforcement.spec.ts`. Re-testing unlock transitions
 * here would need a multi-lesson fixture course and would duplicate that
 * coverage in the slowest runner available.
 *
 * What only a browser can answer is what this file asks: does the page render
 * for a real signed-in student, is it reachable only with a session, and is it
 * accessible. The demo course seeds ONE lesson, so it is always the first in
 * the run and therefore always available — which is exactly the fixture needed
 * to prove the happy path draws.
 */
test.describe('learning path', () => {
  test('redirects an anonymous visitor to login, carrying the destination', async ({ page }) => {
    await page.goto('/path');

    await expect(page).toHaveURL(/\/login\?next=%2Fpath$/);
  });

  test('renders the map for an enrolled student, and passes axe', async ({ page }, testInfo) => {
    const student = uniqueStudent();
    await register(page, student);
    await completeMinimalOnboarding(page, student);
    await enrollInDemoCourse(page);

    await page.goto('/path');

    // The heading and the summary card — the two things the screen exists for.
    await expect(page.getByRole('heading', { level: 1, name: copy.path.title })).toBeVisible();

    // The enrolled course appears in BOTH columns: the rail and the map.
    await expect(page.getByRole('heading', { level: 2, name: 'كورس اختبارات E2E' })).toBeVisible();

    // The demo course's single lesson is first in the run, so it is available
    // and therefore a real link — not the disabled span a locked node renders.
    //
    // `filter({ visible: true })` is not defensive padding: Next's App Router
    // keeps the OUTGOING route segment in the DOM inside a `display: none`
    // container after a client-side transition, so a bare `getByText` matches
    // the badge twice and trips strict mode. `completeMinimalOnboarding` in
    // fixtures.ts documents the same behaviour at length and solves it the
    // same way — this asserts on the badge a student can actually see.
    await expect(page.getByText(copy.path.startHere).filter({ visible: true })).toHaveCount(1);

    // Available nodes are real links; locked ones render a non-navigating
    // span. The demo lesson is available, so it must be reachable.
    await expect(
      page.getByRole('link', { name: 'اختبار تجريبي' }).filter({ visible: true }),
    ).toHaveCount(1);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    await testInfo.attach('axe-path.json', {
      body: JSON.stringify(results.violations, null, 2),
      contentType: 'application/json',
    });

    const blocking = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );
    expect(
      blocking,
      `axe found ${blocking.length} blocking violation(s) on /path: ${blocking
        .map((violation) => violation.id)
        .join(', ')}`,
    ).toEqual([]);
  });

  test('shows the empty state to a student enrolled in nothing', async ({ page }) => {
    const student = uniqueStudent();
    await register(page, student);
    await completeMinimalOnboarding(page, student);

    await page.goto('/path');

    // Scoped to the `main` landmark, not the whole page. While React is still
    // streaming, the suspended subtree exists TWICE in the document: once
    // where it belongs and once inside the `<div hidden id="S:n">` staging
    // container React writes it to before moving it into place. A bare
    // `getByText` matches both and fails Playwright's strict mode with two
    // identical <p> elements -- reliably on the mobile project, which is slow
    // enough to widen that window, and never on desktop. The landmark query
    // ignores the staging copy because `hidden` keeps it out of the
    // accessibility tree, which is also why the failure's own page snapshot
    // showed only one of them.
    await expect(page.getByRole('main').getByText(copy.path.empty)).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: copy.path.emptyCta })).toBeVisible();
  });
});
