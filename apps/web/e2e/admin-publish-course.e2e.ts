import { expect, test } from '@playwright/test';
import { copy } from '@ayman/contracts';
import {
  completeMinimalOnboarding,
  deleteTestCourse,
  loginAsAdmin,
  register,
  uniqueStudent,
} from './fixtures';

/**
 * For assertions that sit directly behind a server action. `test.slow()` below
 * triples the TEST budget but leaves `expect`'s own 10s ceiling (set in
 * `playwright.config.ts`) untouched — so a single write + revalidation round
 * trip that ran long still failed the step, reported as "element not found",
 * which reads like a broken locator rather than a slow round trip. Applied
 * only to the steps that actually wait on the server; ordinary assertions keep
 * the shorter default so a genuinely missing element still fails fast.
 */
const AFTER_SERVER_ACTION = 30_000;

test.describe('admin creates a course -> publishes -> a student sees it', () => {
  // Set once the admin-course-creation step redirects to /admin/courses/:id;
  // `afterEach` runs regardless of whether the test's own assertions passed,
  // so a real, published course this suite creates never survives the run.
  // Undeleted published test courses are exactly what broke `next build`
  // under build-scale catalog traffic during this task's own verification —
  // see the Task 9-15 report.
  let createdCourseId: string | undefined;

  test.afterEach(async ({ page }) => {
    if (!createdCourseId) return;
    await deleteTestCourse(page, createdCourseId).catch((error) => {
      // Best-effort: surfacing a cleanup failure as a console warning rather
      // than a second test failure on top of whatever the test itself
      // already reported.
      console.warn(`e2e cleanup: could not delete course ${createdCourseId}:`, error);
    });
    createdCourseId = undefined;
  });

  test('a draft course is invisible in the public catalog; publishing makes it visible', async ({
    page,
    browser,
  }) => {
    // This is the longest test in the suite by a wide margin: sign-in, then
    // ten sequential server actions (create course, create section, create
    // lesson, save a body, three publish toggles) each followed by a
    // revalidation round trip, plus a second browser context for the visitor.
    //
    // On CI hardware that does not fit in the 60s default. Measured from the
    // trace of a failing run: the lesson-publish click started at 56.7s, so
    // the last two toggles had ~3s between them and the deadline. The test
    // then died at whichever line held the clock -- `publishButtons.nth(0)`
    // -- which reads like a broken locator and is not one. Both projects and
    // both retries failed at that same line for that reason.
    test.slow();

    const stamp = Date.now();
    const title = `كورس اختبار E2E ${stamp}`;
    const slug = `e2e-admin-flow-${stamp}`;

    await loginAsAdmin(page);
    await page.goto('/admin/courses/new');
    await page.getByLabel(copy.admin.course.title).fill(title);
    await page.getByLabel(copy.admin.course.slug).fill(slug);
    // Year defaults to 2 (non-year-1), which shows the track select; picking
    // a track is what populates the subject select's option list at all.
    await page.getByLabel(copy.admin.course.track).selectOption({ index: 1 });
    await page.getByRole('button', { name: copy.admin.common.save }).click();

    // `[^/]+` alone also matches the URL this navigation STARTS on,
    // `/admin/courses/new`, so `waitForURL` returned immediately and
    // `createdCourseId` captured the literal string "new". The afterAll
    // cleanup then tried to delete a course with id "new", failed with a 404
    // it only logged, and left the course it had just published sitting in
    // the public catalog -- visible in CI's own failure screenshots as a pile
    // of "كورس اختبار E2E <stamp>" cards. Excluding the one URL we are
    // navigating away from is what makes this wait mean anything.
    await page.waitForURL(/\/admin\/courses\/(?!new$)[^/]+$/);
    createdCourseId = new URL(page.url()).pathname.split('/').pop();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();

    // Draft, unpublished: a completely separate browser context (a genuinely
    // different, unauthenticated visitor) must not see it in the catalog.
    const visitorContext = await browser.newContext();
    const visitorPage = await visitorContext.newPage();
    await visitorPage.goto('/courses');
    await expect(visitorPage.getByText(title)).toHaveCount(0);

    const sectionTitle = `قسم اختبار ${stamp}`;
    await page.getByLabel(copy.admin.section.title).fill(sectionTitle);
    await page.getByRole('button', { name: copy.admin.section.new }).click();
    await expect(page.getByRole('heading', { name: sectionTitle, level: 3 })).toBeVisible({
      timeout: AFTER_SERVER_ACTION,
    });

    const lessonTitle = `محاضرة اختبار ${stamp}`;
    const lessonTitleInput = page.getByLabel(copy.admin.lesson.title);
    const lessonKindSelect = page.getByLabel(copy.admin.lesson.kind);

    // Filling is retried, and it has to be. The heading assertion above proves
    // the section EXISTS, not that its subtree has stopped re-rendering: when
    // `createSectionAction`'s revalidation lands, the section list remounts,
    // and these two inputs are uncontrolled — whatever was typed into them is
    // silently discarded. The click then submits an empty `required` field,
    // the browser blocks the submit, and NO request is ever sent, so the test
    // sat out its whole timeout waiting for a lesson nobody had asked the
    // server to create. That is what the trace showed: three POSTs in the
    // entire run (sign-in, create course, create section) and no fourth.
    //
    // Both steps are idempotent, so retrying them is safe. The click is NOT
    // idempotent — a retried click would create duplicate lessons — so it
    // stays outside the block, after the values are confirmed to have stuck.
    await expect(async () => {
      await lessonTitleInput.fill(lessonTitle);
      await lessonKindSelect.selectOption({ label: copy.course.lessonKind.text });
      await expect(lessonTitleInput).toHaveValue(lessonTitle, { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });

    await page.getByRole('button', { name: copy.admin.lesson.new }).click();
    await expect(page.getByText(lessonTitle)).toBeVisible({ timeout: AFTER_SERVER_ACTION });

    // A text lesson needs a body before it is worth publishing.
    await page.getByLabel(copy.admin.lesson.body).fill('<p>محتوى تجريبي لمحاضرة اختبار E2E.</p>');
    await page.getByRole('button', { name: copy.admin.common.save }).last().click();

    // Publishing needs "at least one published lesson in a published
    // section" (CourseService.setStatus) -- lesson, then section, then
    // course, in that order. All three toggles render the IDENTICAL "نشر"
    // label, so this clicks the highest surviving index first: once a
    // button is clicked it flips to "unpublish" and drops out of this
    // locator's matches, and Playwright re-queries it live on every action,
    // so the next .nth() call resolves against whatever is left, in the
    // same top-to-bottom DOM order (course, then section, then lesson).
    const publishButtons = page.getByRole('button', { name: copy.admin.course.publish });
    await expect(publishButtons).toHaveCount(3);
    await publishButtons.nth(2).click(); // lesson
    await expect(publishButtons).toHaveCount(2);
    await publishButtons.nth(1).click(); // section
    await expect(publishButtons).toHaveCount(1);
    await publishButtons.nth(0).click(); // course
    // All three (lesson, section, course) are now published -- zero "نشر"
    // buttons remain (each flipped to "unpublish"). Course/section/lesson
    // badges all reuse the SAME `statusPublished` string, so asserting on
    // that text directly is ambiguous (matches all three); the button count
    // is not.
    await expect(publishButtons).toHaveCount(0);

    // updateTag() (not revalidateTag()) is what makes this write visible on
    // the very next request -- no cache-busting query param, no second
    // visit needed, and no fresh context needed either: reload the SAME
    // visitor page that already proved the course was invisible above.
    await visitorPage.reload();
    await expect(visitorPage.getByText(title)).toBeVisible();
    await visitorContext.close();
  });

  test('a freshly registered student cannot reach the admin course list', async ({ page }) => {
    const student = uniqueStudent();
    await register(page, student);
    await expect(page).toHaveURL(/\/onboarding/);
    // Complete onboarding first: an authenticated-but-not-onboarded session
    // redirects to /onboarding on ANY protected route (including /admin/*),
    // which would return 200 and defeat this exact assertion -- the 404
    // this test cares about is the PERMISSION check past that gate, not the
    // onboarding gate itself.
    await completeMinimalOnboarding(page, student);
    await expect(page).toHaveURL(/\/dashboard/);

    // No admin route ever 403s for a non-admin session (that would confirm
    // the route exists to anyone probing it) -- it is indistinguishable from
    // a route that does not exist at all.
    //
    // Asserted on the RENDERED page, not `response.status()`. This app runs
    // `cacheComponents: true` (Next 16 PPR), so on any route that needs
    // fetched data to decide whether to call `notFound()` the 200 status line
    // is committed before `notFound()` resolves -- the body is the not-found
    // page but the status stays 200. `(site)/courses/[slug]/page.tsx` carries
    // the full write-up of that limitation, including the mitigations that
    // were tried and did not work. Nothing about the boundary is weakened by
    // measuring it here instead: `/api/admin/courses` returns a real 403 to
    // this session, and `(admin)/layout.tsx`'s `notFound()` is what renders.
    // `innerText()` resolves immediately against whatever is in the document
    // at that instant — it is not an auto-waiting assertion, and `goto`
    // resolves at `load` while these routes are still streaming. Reading
    // straight after the navigation captured an empty string for the first
    // route and the rendered not-found page for the second, so the comparison
    // failed as `"" !== "404 …"` — which reads exactly like the boundary
    // leaking, on a run where it had not. Both reads wait for content first.
    const readBody = async (url: string): Promise<string> => {
      await page.goto(url);
      const body = page.locator('body');
      await expect(body).not.toBeEmpty();
      return body.innerText();
    };

    const denied = await readBody('/admin/courses');
    const missing = await readBody('/definitely-not-a-real-route');

    // Byte-identical, which is the actual claim: a student probing /admin
    // learns nothing that distinguishes "forbidden" from "does not exist".
    expect(denied).toBe(missing);
  });
});
