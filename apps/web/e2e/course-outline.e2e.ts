import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { copy } from '@ayman/contracts';
import { enrollInDemoCourse, registerAndOnboard, uniqueStudent } from './fixtures';

const c = copy.library;

/**
 * `/library/[slug]` — a course as the student studying it sees it.
 *
 * The GATE RULE is covered exhaustively elsewhere: 25 pure cases in
 * `gate-rule.spec.ts`, 11 through a real service and database in
 * `gate-enforcement.spec.ts`, and the blocker-naming join in
 * `lib/course-outline.test.ts`. None of those can answer what this file asks —
 * does the locked row actually open a dialog, does it name the right lesson to
 * a real reader, and does the link inside it go anywhere.
 */

/** Enrolls the current session in a course by SLUG, via the real API. */
async function enrollBySlug(page: Page, courseId: string): Promise<void> {
  // In-page `fetch`, not `page.request`: `CsrfGuard` needs the `x-csrf-token`
  // header echoing the `__Host-csrf` cookie, plus the Origin/Sec-Fetch-Site
  // pair only a real browser request carries. `fixtures.ts` documents this at
  // length on `enrollInDemoCourse`.
  const result = await page.evaluate(async (id) => {
    const token = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('__Host-csrf='))
      ?.slice('__Host-csrf='.length);
    const response = await fetch(`/api/courses/${id}/enroll`, {
      method: 'POST',
      headers: { 'x-csrf-token': decodeURIComponent(token ?? '') },
    });
    return { ok: response.ok, status: response.status, body: await response.text() };
  }, courseId);

  if (!result.ok) throw new Error(`enroll failed: ${result.status} ${result.body}`);
}

/**
 * MUST match `GATED_COURSE_SLUG` in `apps/api/prisma/seed-admin.ts` — that
 * script is what creates this course, in a package this file cannot import
 * (it would drag Prisma into the Playwright runner). Same arrangement, and the
 * same warning, as `QUIZ_DEMO_COURSE_ID` in `fixtures.ts`.
 */
const GATED_COURSE_SLUG = 'e2e-gated-course';

/**
 * The seeded course that can actually express a lock: two sections, three
 * lessons, `sequential`. Lesson 2 is locked behind lesson 1 and lives in the
 * section the outline opens by default, so it is visible without expanding
 * anything; lesson 3 sits in a section that renders collapsed.
 *
 * ⚠️ This used to scan the catalog for ANY course with `lessonCount >= 2` and
 * skip when it found none. On a freshly seeded database it always found none —
 * the demo course seeds exactly one lesson — so all three tests in this file
 * skipped, every run, including the axe pass. The suite reported green while
 * the locked dialog and the accordion had no coverage whatsoever.
 *
 * The fallback scan is kept as a SECOND choice, not removed: a developer
 * running against a database seeded before this fixture existed still gets the
 * old behaviour rather than a hard failure. But CI runs `seed-admin.ts`, so the
 * named course is always there and these tests no longer skip.
 */
async function findGatedCourse(page: Page): Promise<{ id: string; slug: string } | null> {
  const list = await page.evaluate(async () => {
    const response = await fetch('/api/catalog/courses');
    if (!response.ok) return [];
    const body = (await response.json()) as {
      courses: Array<{ id: string; slug: string; lessonCount: number }>;
    };
    return body.courses;
  });

  return (
    list.find((course) => course.slug === GATED_COURSE_SLUG) ??
    list.find((course) => course.lessonCount >= 2) ??
    null
  );
}

test.describe('course outline', () => {
  test('is closed to anonymous visitors', async ({ page }) => {
    await page.goto('/library/anything');
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows the outline and an enrol prompt before the student starts', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    const course = await findGatedCourse(page);
    test.skip(course === null, 'no published course with 2+ lessons in this environment');

    await page.goto(`/library/${course!.slug}`);

    // The outline renders in full for someone still deciding — hiding it would
    // leave them with nothing to decide on.
    // `.filter({ visible: true })` throughout: the App Router leaves the
    // OUTGOING segment in the document under `display: none`, so a bare match
    // resolves twice and trips strict mode (see `fixtures.ts`).
    await expect(
      page.getByRole('heading', { name: c.outline }).filter({ visible: true }),
    ).toBeVisible();
    await expect(page.getByText(c.notEnrolledTitle).filter({ visible: true })).toBeVisible();

    /*
     * …and every row offers a way IN.
     *
     * This used to assert the opposite — `toHaveCount(0)` on both actions, on
     * the reasoning that an unenrolled student should be able to read the
     * outline but open nothing in it. That reasoning did not survive the
     * question "why?": every course here is free, and enrolling is a single
     * upsert the student is going to perform anyway, so the old behaviour
     * offered someone already signed in and already looking at the course a
     * list of titles and no way to start. The rows now enrol-then-open through
     * `<CourseEntry>`.
     *
     * Worth stating plainly: after that change the old assertion still PASSED,
     * because the control became a `<button>` and the assertion named a
     * `link`. It was green and meaningless. Hence the ROLE below is the one
     * the component actually renders, and the count is positive.
     */
    const actions = page
      .getByRole('main')
      .getByRole('button', { name: new RegExp(`${c.watch}|${c.takeQuiz}`) })
      .filter({ visible: true });
    await expect(actions.first()).toBeVisible();
  });

  test('a locked lesson NAMES what is standing in the way, and links to it', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    const course = await findGatedCourse(page);
    test.skip(course === null, 'no published course with 2+ lessons in this environment');
    await enrollBySlug(page, course!.id);

    await page.goto(`/library/${course!.slug}`);

    // Lesson 1 is first in the run, so it is always available; lesson 2 is
    // locked behind it under `sequential` progression. Only `main` carries
    // outline rows — the rail's course links are list items too.
    const rows = page.getByRole('main').filter({ visible: true }).getByRole('listitem');
    const firstTitle = (await rows.first().locator('p').first().innerText()).trim();
    expect(firstTitle.length).toBeGreaterThan(0);

    const locked = page.getByRole('button', { name: c.lessonLocked }).first();
    await expect(locked).toBeVisible();
    await locked.click();

    // The whole point: the dialog says WHICH lesson, by its real title. The
    // label is not asserted — a quiz blocker says «تنجح في» and any other
    // lesson says «تخلّص», and this test is about the NAME being right.
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(c.lockedTitle)).toBeVisible();
    await expect(dialog.getByText(firstTitle, { exact: false })).toBeVisible();

    // …and offers to take them there rather than leaving them to find it.
    await dialog.getByRole('link', { name: c.lockedGo }).click();
    await expect(page).toHaveURL(/\/courses\/[^/]+\/lessons\//);
  });

  test('has no serious or critical axe violations', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);

    const course = await findGatedCourse(page);
    test.skip(course === null, 'no published course with 2+ lessons in this environment');

    await page.goto(`/library/${course!.slug}`);
    await expect(
      page.getByRole('heading', { name: c.outline }).filter({ visible: true }),
    ).toBeVisible();

    /*
     * Open every unit before scanning.
     *
     * The outline opens only the section holding the next lesson and collapses
     * the rest, and axe does not evaluate what it cannot see — so on a
     * multi-section course the default state hides most of the rows from this
     * check. Expanding first is what makes the assertion cover the whole
     * outline instead of its first section.
     */
    await page.locator('details.unit:not([open])').evaluateAll((units) => {
      for (const unit of units) (unit as HTMLDetailsElement).open = true;
    });

    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);
  });
});
