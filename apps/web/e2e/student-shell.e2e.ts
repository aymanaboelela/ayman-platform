import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { copy } from '@ayman/contracts';
import { enrollInDemoCourse, registerAndOnboard, uniqueStudent } from './fixtures';

/**
 * The signed-in shell and the rebuilt dashboard.
 *
 * Everything here is asserted through roles and visible Arabic copy rather
 * than through class names, with two deliberate exceptions: the rail's
 * collapsed state and the route-forced override are expressed as attributes
 * (`html[data-rail]`, `.shell[data-rail-forced]`) because that is genuinely
 * what they ARE — CSS-driven layout state with no accessible counterpart — and
 * asserting a computed width instead would be a slower test of the same fact.
 *
 * Desktop only for the rail assertions: below `md` there is no rail at all and
 * the same links live in the topbar's sheet. The mobile project runs the
 * dashboard-content and axe tests, which are viewport-independent.
 */

test.describe('student shell', () => {
  test('a new student lands on a dashboard that tells them what to do first', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    await page.goto('/dashboard');

    // The first-run card, with step 1 outstanding and carrying the only
    // accent CTA on the page.
    const startHere = page.getByRole('region', { name: copy.dashboard.startHereTitle });
    await expect(startHere).toBeVisible();
    await expect(startHere.getByText(copy.dashboard.stepEnrollTitle)).toBeVisible();
    await expect(startHere.getByRole('link', { name: copy.dashboard.stepEnrollCta })).toBeVisible();

    // …and the later steps are listed but deliberately not actionable yet.
    await expect(startHere.getByRole('link', { name: copy.dashboard.stepQuizCta })).toHaveCount(0);
  });

  test('the first step ticks itself off once the student is enrolled', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);

    await page.goto('/dashboard');

    const startHere = page.getByRole('region', { name: copy.dashboard.startHereTitle });
    // "خطوة ١ من ٣" — one done. The literal is built from the same copy
    // template the card renders, so a wording change moves both together.
    await expect(
      startHere.getByText(
        copy.dashboard.startHereProgress.replace('{done}', '1').replace('{total}', '3'),
      ),
    ).toBeVisible();

    // The CTA has moved on to step 2 rather than still pointing at the
    // catalog — the whole point of deriving the steps from live data.
    await expect(startHere.getByRole('link', { name: copy.dashboard.stepLessonCta })).toBeVisible();
  });

  test('the rail carries the student’s own courses', async ({ page }) => {
    test.skip(
      test.info().project.name !== 'desktop',
      'there is no rail below the md breakpoint; the sheet carries these links instead',
    );

    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);

    await page.goto('/dashboard');

    // `.first()`: the same nav landmark name is used by the rail and by the
    // topbar's mobile sheet, and both are in the DOM at a desktop viewport
    // (the sheet is `md:hidden`, i.e. hidden, not unmounted).
    const rail = page.getByRole('navigation', { name: copy.nav.mainNav }).first();
    await expect(rail.getByRole('link', { name: copy.nav.dashboard })).toBeVisible();
    await expect(rail.getByRole('link', { name: copy.nav.path })).toBeVisible();
    await expect(rail.getByRole('link', { name: copy.nav.courses })).toBeVisible();

    // The enrolled course streams into the rail from its own Suspense
    // boundary. Asserting the heading is visible AND that the "no courses
    // yet" line is gone is what proves the boundary actually resolved, rather
    // than the test passing against a skeleton that never settled.
    await expect(page.getByText(copy.nav.railCourses).first()).toBeVisible();
    await expect(page.getByText(copy.nav.railCoursesEmpty)).toHaveCount(0);
  });

  test('the collapse toggle persists across a reload', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'no rail below the md breakpoint');

    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await page.goto('/dashboard');

    await expect(page.locator('html')).not.toHaveAttribute('data-rail', 'collapsed');

    await page.getByRole('button', { name: copy.nav.collapseRail }).click();
    await expect(page.locator('html')).toHaveAttribute('data-rail', 'collapsed');

    // The point of persisting it in localStorage and applying it from the
    // pre-paint inline script: it survives a full document load, and it is
    // already applied on the first frame rather than snapping shut on
    // hydration.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-rail', 'collapsed');
    await expect(page.getByRole('button', { name: copy.nav.expandRail })).toBeVisible();
  });

  test('the lesson player forces the rail collapsed without overwriting the preference', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'desktop', 'no rail below the md breakpoint');

    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);

    // Via /path, not via /courses. `(site)/courses/**` is the MARKETING
    // catalog — a different route group with its own header and no rail — and
    // the seeded course's slug is generated per run (`quiz-fixture-<uuid>`),
    // so there is no stable URL to navigate to directly. `/path` is inside the
    // shell, lists the same lesson, and `learning-path.e2e.ts` already proves
    // the demo course's single lesson renders there as a real link.
    await page.goto('/path');

    // `filter({ visible: true })`: Next's App Router keeps the outgoing route
    // segment in the DOM inside a `display: none` container after a
    // client-side transition, so a bare locator can match a leftover copy.
    // `fixtures.ts` documents this at length.
    const lesson = page.getByRole('link', { name: 'اختبار تجريبي' }).filter({ visible: true });
    await expect(lesson).toHaveCount(1);
    await lesson.click();
    await page.waitForURL(/\/lessons\//);

    await expect(page.locator('.shell')).toHaveAttribute('data-rail-forced', 'true');
    // The override is a route rule, not a write: the student never chose this,
    // so nothing may have been stored.
    await expect(page.locator('html')).not.toHaveAttribute('data-rail', 'collapsed');

    // Leaving restores the expanded rail.
    await page.goto('/dashboard');
    await expect(page.locator('.shell')).not.toHaveAttribute('data-rail-forced', 'true');
  });

  test('the account menu opens onto the signed-in identity', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await page.goto('/dashboard');

    await page.getByRole('button', { name: copy.nav.accountMenu }).click();

    await expect(page.getByText(student.email)).toBeVisible();
    await expect(page.getByRole('menuitem', { name: copy.nav.devices })).toBeVisible();
    // `menuitem`, not `button`: `<SignOutButton>` is rendered through
    // `DropdownMenuItem asChild`, so Radix puts `role="menuitem"` on the
    // underlying <button> and that is the role assistive tech reports.
    await expect(page.getByRole('menuitem', { name: copy.nav.logout })).toBeVisible();
  });

  test('has no serious or critical axe violations', async ({ page }, testInfo) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);
    await page.goto('/dashboard');

    // Wait for the streamed rail content, so the audit covers the settled
    // page rather than its skeletons.
    await expect(page.getByRole('region', { name: copy.dashboard.startHereTitle })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const serious = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );

    await testInfo.attach('axe-violations', {
      body: JSON.stringify(serious, null, 2),
      contentType: 'application/json',
    });

    expect(serious).toEqual([]);
  });
});
