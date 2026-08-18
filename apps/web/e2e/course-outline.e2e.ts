import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { copy } from '@ayman/contracts';
import { enrollInDemoCourse, registerAndOnboard, uniqueStudent } from './fixtures';

const c = copy.library;

/**
 * `/library/[slug]` — a course as the student studying it sees it.
 *
 * The GATE RULE is covered exhaustively elsewhere: the pure cases in
 * `gate-rule.spec.ts`, the end-to-end ones through a real service and database
 * in `gate-enforcement.spec.ts`, and the presentation join in
 * `lib/course-outline.test.ts`. None of those can answer what this file asks —
 * does a lecture a student has never touched actually open, does the one
 * remaining padlock explain itself to a real reader, and does the dialog it
 * opens leave them somewhere other than where they started.
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
 * The seeded course that can actually express a lock: two sections, two
 * lectures and a final exam. Both lectures open from the day the student
 * enrols; the exam is locked until they are cleared, and it lives in the
 * second section — which renders COLLAPSED, since the outline opens the one
 * holding `nextLessonId`.
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

  /**
   * The change itself, asserted through the only surface that can prove it: a
   * student who has finished NOTHING opens the last lecture of the course.
   *
   * Under the sequential chain this row rendered as `.chip--locked` — a
   * `<button>` reading «مقفول» — and the route behind it answered 404. There is
   * no fixture state to set up: the assertion is that a fresh enrolment can go
   * straight to the end.
   */
  test('opens a lecture the student has never touched', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    const course = await findGatedCourse(page);
    test.skip(course === null, 'no published course with 2+ lessons in this environment');
    await enrollBySlug(page, course!.id);

    await page.goto(`/library/${course!.slug}`);

    // Only `main` carries outline rows — the rail's course links are list
    // items too. `.filter({ visible: true })`: the App Router leaves the
    // OUTGOING segment in the document under `display: none`, so a bare match
    // resolves twice and trips strict mode (see `fixtures.ts`).
    const watch = page
      .getByRole('main')
      .filter({ visible: true })
      .getByRole('link', { name: new RegExp(c.watch) });

    // The LAST lecture, not the first — the first was open before this change
    // too, so asserting it would pass against the behaviour being removed.
    await watch.last().click();
    await expect(page).toHaveURL(/\/courses\/[^/]+\/lessons\//);

    // …and the player really rendered it, rather than the gate bouncing the
    // student back to the outline the way a 404 on this route does.
    await expect(page).not.toHaveURL(/\/library\//);
  });

  /**
   * And every row says whether they have been there — the half of this change
   * that replaces what the padlock used to communicate by simply existing.
   */
  test('marks the lectures the student has not watched', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    const course = await findGatedCourse(page);
    test.skip(course === null, 'no published course with 2+ lessons in this environment');
    await enrollBySlug(page, course!.id);

    await page.goto(`/library/${course!.slug}`);

    const unwatched = page
      .getByRole('main')
      .filter({ visible: true })
      .getByText(c.lessonNew, { exact: false });
    await expect(unwatched.first()).toBeVisible();
  });

  test('the locked exam explains itself, and its dialog dismisses', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    const course = await findGatedCourse(page);
    test.skip(course === null, 'no published course with 2+ lessons in this environment');
    await enrollBySlug(page, course!.id);

    await page.goto(`/library/${course!.slug}`);

    // The exam sits in the second section, which the outline renders collapsed
    // — the student has not started, so the unit it opens is the first one.
    await page.locator('details.unit:not([open])').evaluateAll((units) => {
      for (const unit of units) (unit as HTMLDetailsElement).open = true;
    });

    const locked = page.getByRole('button', { name: c.lessonLocked }).first();
    await expect(locked).toBeVisible();
    await locked.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(c.lockedExamTitle)).toBeVisible();

    /*
     * ⚠️ There is exactly ONE control in the footer, and this is the assertion
     * that keeps it that way.
     *
     * The dialog used to carry «نفتحها دلوقتي» beside it, linking to the lesson
     * standing in the way — which on the player resolved to the page the
     * student was already on, so pressing it navigated to the current URL and
     * did nothing at all. «الـ٢ بتن دول مش شغالين». A dialog that explains a
     * block must not offer a control that lands the student where they are.
     */
    await expect(dialog.getByRole('link')).toHaveCount(0);

    // …and the one control it does have actually closes it.
    await dialog.getByRole('button', { name: c.lockedClose }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
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
