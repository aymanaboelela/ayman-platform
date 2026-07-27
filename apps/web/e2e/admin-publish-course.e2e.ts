import { expect, test } from '@playwright/test';
import { copy } from '@ayman/contracts';
import {
  completeMinimalOnboarding,
  deleteTestCourse,
  loginAsAdmin,
  register,
  uniqueStudent,
} from './fixtures';

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

    await page.waitForURL(/\/admin\/courses\/[^/]+$/);
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
    await expect(page.getByRole('heading', { name: sectionTitle, level: 3 })).toBeVisible();

    const lessonTitle = `محاضرة اختبار ${stamp}`;
    await page.getByLabel(copy.admin.lesson.title).fill(lessonTitle);
    await page.getByLabel(copy.admin.lesson.kind).selectOption({ label: copy.course.lessonKind.text });
    await page.getByRole('button', { name: copy.admin.lesson.new }).click();
    await expect(page.getByText(lessonTitle)).toBeVisible();

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
    // the route exists to anyone probing it) -- it 404s, identically to a
    // route that does not exist at all.
    const response = await page.goto('/admin/courses');
    expect(response?.status()).toBe(404);
  });
});
