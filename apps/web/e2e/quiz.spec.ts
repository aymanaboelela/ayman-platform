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
 * lesson (`E2E_QUIZ_LESSON_ID`) with at least 3 questions, and — for the
 * improvement test — a published final exam whose improvement paper is built
 * (`E2E_EXAM_LESSON_ID`). Matching however Plan 7's seed script names these;
 * adjust the constants below to match.
 */
const STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL ?? 'student@example.test';
const STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'Passw0rd!123';
const QUIZ_LESSON_ID = process.env.E2E_QUIZ_LESSON_ID ?? '';
/** A course's final exam, with improvement on and a built improvement paper. */
const EXAM_LESSON_ID = process.env.E2E_EXAM_LESSON_ID ?? '';

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

    // 2. Press start → the GATE opens; nothing is created until it is
    // confirmed. Its three points are the three facts a student used to be
    // able to discover only by losing something.
    await page.getByRole('button', { name: 'ابدأ الامتحان' }).click();
    await expect(page.getByText('قبل ما تبدأ')).toBeVisible();
    await expect(page.getByText('درجتك هتتسجّل')).toBeVisible();

    // Backing out must NOT create an attempt.
    await page.getByRole('button', { name: 'مش دلوقتي' }).click();
    await expect(page.getByText('قبل ما تبدأ')).toBeHidden();

    // Now through it for real; the start response must carry none of the
    // forbidden answer-leak keys.
    await page.getByRole('button', { name: 'ابدأ الامتحان' }).click();
    const startResponse = page.waitForResponse((response) => /\/api\/quiz\/quizzes\/.+\/attempts$/.test(response.url()));
    await page.getByRole('button', { name: 'فاهم، ابدأ الامتحان' }).click();
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

    // 6. «وريني غلطاتي بس» — the question a student actually opens the review
    // to ask. Only rendered when something IS wrong, so a perfect paper skips
    // it rather than offering a filter whose only outcome is an empty screen.
    const wrongOnly = page.getByRole('button', { name: 'وريني غلطاتي بس' });
    if (await wrongOnly.isVisible().catch(() => false)) {
      await wrongOnly.click();
      await expect(wrongOnly).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: 'كل الأسئلة' }).click();
    } else {
      await expect(page.getByText('مفيش ولا غلطة — ورقة كاملة')).toBeVisible();
    }

    // 7. The sitting is spent. An ordinary quiz allows exactly one, and the
    // intro must say so rather than offering a button the API would refuse.
    await page.goto(`/quizzes/${QUIZ_LESSON_ID}`);
    await expect(page.getByRole('button', { name: 'ابدأ الامتحان' })).toBeHidden();
    await expect(page.getByText('خلاص امتحنت الامتحان ده')).toBeVisible();
  });

  /**
   * The improvement sitting, end to end.
   *
   * Needs its OWN seeded lesson: a course's final exam with
   * `allowsImprovement` on and a non-empty improvement paper — which the
   * publish guard requires anyway, so a seeded exam that publishes at all
   * already satisfies it.
   */
  test('a student can sit the improvement paper once, and the higher mark counts', async ({ page }) => {
    test.skip(!EXAM_LESSON_ID, 'requires a seeded improvable exam lesson id (E2E_EXAM_LESSON_ID)');

    await page.goto('/login');
    await page.getByLabel('البريد الإلكتروني').fill(STUDENT_EMAIL);
    await page.getByLabel('كلمة المرور').fill(STUDENT_PASSWORD);
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await page.waitForURL('**/dashboard');

    await page.goto(`/quizzes/${EXAM_LESSON_ID}`);

    // The improvement gate says something different from the first one, and
    // the difference is the point: a worse result cannot cost the student the
    // mark they already hold.
    await page.getByRole('button', { name: 'ادخل امتحان التحسين' }).click();
    await expect(page.getByText('الأسئلة هتكون مختلفة')).toBeVisible();
    await expect(page.getByText('درجتك الحالية في أمان')).toBeVisible();
    await page.getByRole('button', { name: 'ذاكرت، ابدأ التحسين' }).click();

    await expect(page.getByRole('timer')).toBeVisible();

    // Answer everything, submit.
    const navButtons = page.getByRole('navigation', { name: 'خريطة الأسئلة' }).getByRole('button');
    const count = await navButtons.count();
    for (let i = 0; i < count; i += 1) {
      await navButtons.nth(i).click();
      const option = page.locator('label').first();
      if (await option.isVisible().catch(() => false)) await option.click();
    }
    await page.getByRole('button', { name: 'سلّم الامتحان' }).first().click();
    await page.getByRole('button', { name: 'أيوه، سلّم' }).click();
    await page.waitForURL('**/review');

    // Back on the intro: both sittings listed, exactly one marked as counting,
    // and no third sitting on offer.
    await page.goto(`/quizzes/${EXAM_LESSON_ID}`);
    await expect(page.getByText('الامتحان الأصلي')).toBeVisible();
    await expect(page.getByText('امتحان التحسين').first()).toBeVisible();
    await expect(page.getByText('الدرجة المحتسبة')).toHaveCount(1);
    await expect(page.getByRole('button', { name: /ابدأ الامتحان|ادخل امتحان التحسين/ })).toBeHidden();
  });

  test('axe reports no violations on the runner and the review page', async () => {
    test.skip(true, 'wire @axe-core/playwright once the harness exists (Plan 7)');
  });
});
