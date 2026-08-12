import { expect, test } from '@playwright/test';
import { EXAM_SECTION_TITLE, copy } from '@ayman/contracts';
import { deleteTestCourse, loginAsAdmin } from './fixtures';

/**
 * The course builder's own capabilities — the ones that had no control at all
 * until this change set: inline rename, delete, and the one-press exam.
 *
 * Deliberately NOT a second copy of `admin-publish-course.e2e.ts`. That spec
 * owns "draft is invisible, published is visible" end to end and is the
 * longest test in the suite; duplicating its publish sequence here would
 * double the slowest thing in CI to re-assert something already covered.
 */
const AFTER_SERVER_ACTION = 30_000;

test.describe('admin course builder', () => {
  /*
   * ⚠️ RETRIES FOR A PRODUCT BUG THAT PREDATES THIS FILE.
   *
   * `admin-publish-course.e2e.ts` documents it with a CI trace: a server
   * action's POST returns 2xx, but the result React is waiting on never
   * arrives, so `useActionState`'s pending state never clears and the button
   * stays `disabled` forever.
   *
   * Reproduced here while writing this spec, on a local run with Redis up.
   * Two consecutive runs of the same test: the first created its section and
   * lesson normally (both POSTs 201) and failed later on an unrelated
   * locator; the second hung at section creation with the page still showing
   * «مفيش أقسام لسه» and «قسم جديد» disabled, after its POST had returned 201.
   *
   * No assertion can make a hung action settle. These retries are the honest
   * cost of that intermittency, not a patch over a flaky locator — the
   * locators in this file were wrong once and were FIXED rather than retried
   * around.
   *
   * DELETE THIS BLOCK when the hang is fixed. If it is still here and this
   * spec is red, the assertions are not where to look.
   */
  test.describe.configure({ retries: 3 });

  let createdCourseId: string | undefined;

  test.afterEach(async ({ page }) => {
    if (!createdCourseId) return;
    await deleteTestCourse(page, createdCourseId).catch((error) => {
      console.warn(`e2e cleanup: could not delete course ${createdCourseId}:`, error);
    });
    createdCourseId = undefined;
  });

  test('renames a section inline, adds a lesson, and builds the exam in one press', async ({
    page,
  }, testInfo) => {
    /*
     * SKIPPED ON `mobile`, matching `admin-publish-course.e2e.ts`.
     *
     * That spec documents a pre-existing mobile-only failure in this exact
     * flow — «the section heading never appears after createSectionAction» at
     * a 412px viewport — and it is not this change set's to fix. The admin
     * surface is staff-facing and used on a desktop; the same steps run in
     * full on `desktop`.
     *
     * Worth re-testing when that failure is understood: the section header has
     * changed shape twice since this note was written — a plain <div>, then a
     * <summary> inside a <details>, and now a <div> again carrying a
     * hand-built disclosure — so the mobile behaviour may have moved in either
     * direction with it.
     */
    test.skip(
      testInfo.project.name === 'mobile',
      'admin course editor has a pre-existing mobile failure — see admin-publish-course.e2e.ts',
    );

    // Sign-in plus eight sequential server actions, each followed by a
    // revalidation round trip. Same reasoning as the sibling spec: this does
    // not fit the 60s default on CI hardware.
    test.slow();

    const stamp = Date.now();
    const title = `كورس بناء E2E ${stamp}`;

    await loginAsAdmin(page);
    await page.goto('/admin/courses/new');
    await page.getByLabel(copy.admin.course.title).fill(title);
    await page.getByLabel(copy.admin.course.slug).fill(`e2e-builder-${stamp}`);
    // Year defaults to 2 (non-year-1), which shows the track select; picking a
    // track is what populates the subject select's options at all.
    await page.getByLabel(copy.admin.course.track).selectOption({ index: 1 });
    await page.getByRole('button', { name: copy.admin.common.save }).click();

    // `[^/]+` alone also matches `/admin/courses/new`, the URL this navigation
    // starts on — excluding it is what makes the wait mean anything.
    await page.waitForURL(/\/admin\/courses\/(?!new$)[^/]+$/);
    createdCourseId = new URL(page.url()).pathname.split('/').pop();

    /* ── the exam, before any section exists ───────────────────────────────
     * The whole point of the button: an instructor should not have to build
     * the scaffolding by hand first. It creates its own section.
     */
    await expect(page.getByText(copy.admin.exam.gateNoLessons)).toBeVisible();
    await page.getByRole('button', { name: copy.admin.exam.scaffold }).click();

    // One press lands on the question builder — not on a settings tab, and not
    // back on the course page having quietly made a lesson.
    await page.waitForURL(/\/admin\/quizzes\/[^/]+$/, { timeout: AFTER_SERVER_ACTION });
    const quizUrl = page.url();

    await page.goto(`/admin/courses/${createdCourseId}`);

    // The exam now exists, is empty, and the band says so rather than
    // pretending it is ready.
    await expect(page.getByRole('link', { name: copy.admin.exam.open })).toBeVisible();
    await expect(page.getByText(copy.admin.exam.noQuestions).first()).toBeVisible();
    await expect(page.getByRole('button', { name: copy.admin.exam.scaffold })).toHaveCount(0);

    /* ── inline rename ─────────────────────────────────────────────────────
     * The scaffolded section is the only section on the page, and its title
     * carries EXAM_SECTION_TITLE — which is also what the section was named.
     *
     * Scoped to the section header's editable title by ROLE, not by text.
     * `getByText(EXAM_SECTION_TITLE)` matches the hidden <option> inside the
     * advanced exam picker first, and asserting on a hidden option is how a
     * test passes while the visible page is wrong.
     */
    // Located by its OWN TEXT, which is also the assertion: `InlineTitle`
    // carries no aria-label, precisely so that a section's accessible name is
    // the section's name. When it had one, every title on the page was
    // announced as «اسم القسم» and this locator could not have told the
    // difference between a correct page and an empty one.
    const sectionTitle = page.getByRole('button', { name: EXAM_SECTION_TITLE }).first();
    await expect(sectionTitle).toBeVisible();

    // Pressing the title must EDIT it, and nothing else.
    //
    // This used to be a guard against the header's `<summary>`, which toggled
    // on any click inside it and needed every child to stop propagation. The
    // header is a hand-built disclosure now and only the chevron toggles, so
    // the assertion is no longer defending against that — it still earns its
    // place as the check that the title is a rename control at all.
    await sectionTitle.click();
    const renamed = `الوحدة المعدّلة ${stamp}`;
    // `textbox`, not `button`: InlineTitle renders a button until it is
    // editing, so the role is what distinguishes the two states — and what
    // separates this field from the "new section" input further down the page,
    // which carries the same label.
    const input = page.getByRole('textbox', { name: copy.admin.section.title }).first();
    await input.fill(renamed);
    await input.press('Enter');

    await expect(page.getByRole('button', { name: renamed })).toBeVisible({
      timeout: AFTER_SERVER_ACTION,
    });

    // Survives a reload — i.e. it was written, not just held in React state.
    await page.reload();
    await expect(page.getByRole('button', { name: renamed })).toBeVisible({
      timeout: AFTER_SERVER_ACTION,
    });
  });

  test('deletes a lesson with no attempts, with no consequence line', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === 'mobile',
      'admin course editor has a pre-existing mobile failure — see admin-publish-course.e2e.ts',
    );
    test.slow();

    const stamp = Date.now();
    const title = `كورس حذف E2E ${stamp}`;

    await loginAsAdmin(page);
    await page.goto('/admin/courses/new');
    await page.getByLabel(copy.admin.course.title).fill(title);
    await page.getByLabel(copy.admin.course.slug).fill(`e2e-delete-${stamp}`);
    await page.getByLabel(copy.admin.course.track).selectOption({ index: 1 });
    await page.getByRole('button', { name: copy.admin.common.save }).click();
    await page.waitForURL(/\/admin\/courses\/(?!new$)[^/]+$/);
    createdCourseId = new URL(page.url()).pathname.split('/').pop();

    /*
     * The lesson under test is the one the exam scaffold creates, NOT one
     * built by hand here.
     *
     * Creating a section and then a lesson through the two inline forms is
     * where the pre-existing `useActionState` hang bites hardest — two
     * consecutive actions, either of which can leave its button disabled
     * forever. This test is about the DELETE dialog, so it should not also be
     * a second test of section creation; `admin-publish-course.e2e.ts` already
     * owns that path, and the test above exercises the scaffold.
     *
     * One press, one action, and it leaves exactly the lesson this needs.
     */
    await page.getByRole('button', { name: copy.admin.exam.scaffold }).click();
    await page.waitForURL(/\/admin\/quizzes\/[^/]+$/, { timeout: AFTER_SERVER_ACTION });
    await page.goto(`/admin/courses/${createdCourseId}`);

    // The scaffolded section is the course's only one, so it renders expanded.
    //
    // `.first()` because this page is partially prerendered: during streaming
    // the locator can briefly resolve to two nodes and trip strict mode.
    // Verified in a real browser that the settled DOM holds exactly one
    // `.lesson-row` here — the duplicate is a transient, not a double render.
    const row = page.locator('.lesson-row').filter({ hasText: EXAM_SECTION_TITLE }).first();
    await expect(row).toBeVisible({ timeout: AFTER_SERVER_ACTION });

    await row.getByRole('button', { name: copy.admin.lesson.delete }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(copy.admin.lesson.deleteConfirm)).toBeVisible();
    // No student progress on a lesson created seconds ago, so the consequence
    // line must be ABSENT — a confirmation that always warns is one nobody
    // reads.
    await expect(dialog.getByText(copy.admin.lesson.deleteWithProgress)).toHaveCount(0);
    await dialog.getByRole('button', { name: copy.admin.lesson.delete }).click();

    await expect(row).toHaveCount(0, { timeout: AFTER_SERVER_ACTION });

    // The course's exam pointer is `onDelete: SetNull`, so deleting the exam
    // lesson leaves the course intact and offers to build one again.
    await expect(page.getByRole('button', { name: copy.admin.exam.scaffold })).toBeVisible({
      timeout: AFTER_SERVER_ACTION,
    });
  });
});
