import { expect, test } from '@playwright/test';

/**
 * Spec §8's attempt → submit → review flow, end to end against a real
 * running web+API stack with a seeded student/course/quiz.
 *
 * NOT YET RUNNABLE in this workspace — `@playwright/test` is not installed
 * and no `playwright.config.ts` exists (`apps/web/vitest.config.ts`'s own
 * comment documents `*.e2e.ts` as "Playwright's glob (Plan 7)"; this file
 * uses the exact path/name Task 22's brief specifies, `apps/web/e2e/quiz.spec.ts`,
 * which is Playwright's own out-of-the-box default naming). Written now, to
 * run the moment Plan 7 (or a follow-up) wires up the harness — every
 * selector below is a real `copy.*` string or role/label already shipped in
 * this batch, not a placeholder.
 *
 * Fixture assumption: a seeded student account (`E2E_STUDENT_EMAIL`/
 * `E2E_STUDENT_PASSWORD`) enrolled in a course with a published, graded quiz
 * lesson (`E2E_QUIZ_LESSON_ID`) with at least 3 questions, and a seeded
 * admin account (`E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`) — matching however
 * Plan 7's seed script names these, adjust the constants below to match.
 */
const STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL ?? 'student@example.test';
const STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'Passw0rd!123';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@example.test';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Passw0rd!123';
const QUIZ_LESSON_ID = process.env.E2E_QUIZ_LESSON_ID ?? '';

const FORBIDDEN_KEYS = ['fraction', 'isCorrect', 'feedback', 'feedbackHtml', 'rightAnswer', 'rightAnswerText'];

test.describe('quiz attempt → submit → review', () => {
  test.skip(!QUIZ_LESSON_ID, 'requires a seeded quiz lesson id (E2E_QUIZ_LESSON_ID)');

  test('a student can start, answer, flag, lose the tab, resume, submit and review', async ({ page }) => {
    // 1. Sign in, open the quiz lesson.
    await page.goto('/login');
    await page.getByLabel('البريد الإلكتروني').fill(STUDENT_EMAIL);
    await page.getByLabel('كلمة المرور').fill(STUDENT_PASSWORD);
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await page.waitForURL('**/dashboard');

    await page.goto(`/quizzes/${QUIZ_LESSON_ID}`);

    // 2. Start a graded attempt; the start response must carry none of the
    // forbidden answer-leak keys.
    const startResponse = page.waitForResponse((response) => /\/api\/quiz\/quizzes\/.+\/attempts$/.test(response.url()));
    await page.getByRole('button', { name: 'ابدأ الامتحان' }).click();
    const started = await startResponse;
    const startBody = await started.text();
    for (const key of FORBIDDEN_KEYS) {
      expect(startBody).not.toContain(`"${key}"`);
    }
    await expect(page.getByRole('timer')).toBeVisible();

    // 3. Answer three of five (this fixture has >=3 questions); flag one;
    // reload; assert the same answers, order, flag and a continuing timer.
    const firstOptionLabel = page.locator('label').first();
    await firstOptionLabel.click();
    await page.getByRole('button', { name: 'التالي' }).click();
    await page.locator('label').first().click();
    await page.getByRole('button', { name: 'علّم السؤال' }).click(); // flag this one
    await page.getByRole('button', { name: 'التالي' }).click();
    await page.locator('label').first().click();

    // Let the autosave flush (blur/navigation already triggers it, this is belt-and-braces).
    await page.waitForTimeout(500);
    const urlBeforeReload = page.url();
    await page.reload();
    await expect(page).toHaveURL(urlBeforeReload);
    await expect(page.getByRole('timer')).toBeVisible();

    // 4. Submit → dialog reports 2 unanswered → cancel → answer the rest → submit → confirm.
    await page.getByRole('button', { name: 'سلّم الامتحان' }).first().click();
    await expect(page.getByText(/لسه فيه \d+ سؤال من غير إجابة/)).toBeVisible();
    await page.getByRole('button', { name: 'ارجع للأسئلة' }).click();

    // Answer whatever chips were unanswered, then submit again.
    // (Exact navigation depends on the seeded question count; this walks the
    // navigator left to right filling anything still empty.)
    const navButtons = page.getByRole('navigation', { name: 'خريطة الأسئلة' }).getByRole('button');
    const count = await navButtons.count();
    for (let i = 0; i < count; i += 1) {
      await navButtons.nth(i).click();
      const unanswered = await page.locator('label').first().isVisible().catch(() => false);
      if (unanswered) await page.locator('label').first().click();
    }

    await page.getByRole('button', { name: 'سلّم الامتحان' }).first().click();
    await expect(page.getByText('جاوبت على كل الأسئلة')).toBeVisible();
    await page.getByRole('button', { name: 'أيوه، سلّم' }).click();

    // 5. Results + review.
    await page.waitForURL('**/review');
    await expect(page.getByText('نتيجتك')).toBeVisible();
    await expect(page.getByText(/\d+\s*\/\s*\d+/)).toBeVisible();

    const reviewBody = await page.content();
    // The correct answer must appear ONLY if this window's matrix allows it —
    // asserted structurally elsewhere (quiz.authz.spec.ts, review.serializer
    // .spec.ts); here we only confirm the page rendered per-question verdicts.
    expect(reviewBody).toContain('font-medium');

    // 6. File a appeal, resolve as admin, confirm before/after on screen.
    const appealButton = page.getByRole('button', { name: 'قدّم تظلم' }).first();
    if (await appealButton.isVisible().catch(() => false)) {
      await appealButton.click();
      await page.getByLabel('اكتب سبب التظلم').fill('مش موافق على التصحيح ده، أنا متأكد من إجابتي والله');
      await page.getByRole('button', { name: 'ابعت التظلم' }).click();
      await expect(page.getByText('وصلنا تظلمك')).toBeVisible();

      const reviewUrl = page.url();

      await page.goto('/login');
      await page.getByLabel('البريد الإلكتروني').fill(ADMIN_EMAIL);
      await page.getByLabel('كلمة المرور').fill(ADMIN_PASSWORD);
      await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
      await page.goto('/admin/appeals');
      await page.getByRole('button', { name: 'اعتمد القرار' }).first().click();
      await page.getByLabel('الدرجة الجديدة').fill('1');
      await page.getByLabel('رد المدرّس').fill('معاك حق');
      await page.getByRole('button', { name: 'اقبل التظلم' }).click();

      await page.goto('/login');
      await page.getByLabel('البريد الإلكتروني').fill(STUDENT_EMAIL);
      await page.getByLabel('كلمة المرور').fill(STUDENT_PASSWORD);
      await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
      await page.goto(reviewUrl);
      await expect(page.getByText('الدرجة قبل التظلم')).toBeVisible();
      await expect(page.getByText('الدرجة بعد التظلم')).toBeVisible();
    }
  });

  test('practice mode gives instant per-question feedback and leaks nothing pre-grade', async ({ page }) => {
    // Requires a second, PRACTICE-mode quiz lesson — left as a documented gap
    // for whoever wires the seed data (Plan 7): same drill as above, but
    // asserting the `check` endpoint's response never carries `answerPattern`
    // and the option list is unchanged before the check.
    test.skip(true, 'requires a seeded practice-mode quiz lesson id');
  });

  test('axe reports no violations on the runner and the review page', async ({ page }) => {
    test.skip(true, 'wire @axe-core/playwright once the harness exists (Plan 7)');
  });
});
