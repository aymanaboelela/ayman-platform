import { expect, test } from '@playwright/test';
import { copy } from '@ayman/contracts';
import { QUIZ_DEMO_LESSON_ID, enrollInDemoCourse, registerAndOnboard, uniqueStudent } from './fixtures';

const FORBIDDEN_KEYS = ['fraction', 'isCorrect', 'feedback', 'feedbackHtml', 'rightAnswer', 'rightAnswerText'];

test.describe('quiz attempt -> submit -> review', () => {
  test('answers are graded server-side and never leak before submission', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);

    await page.goto(`/quizzes/${QUIZ_DEMO_LESSON_ID}`);

    // THE contract assertion: the payload that starts the paper must not
    // carry grading data. This is the highest-value single check in the
    // whole suite -- it is the one thing positioned to catch a regression
    // in any of the three answer-leak layers (see quiz-leak.contract.spec.ts
    // on the API side for the unit-level equivalent).
    const [attemptResponse] = await Promise.all([
      page.waitForResponse(
        (res) => /\/api\/quiz\/quizzes\/.+\/attempts$/.test(res.url()) && res.request().method() === 'POST',
      ),
      page.getByRole('button', { name: copy.quiz.start }).click(),
    ]);
    const raw = await attemptResponse.text();
    for (const key of FORBIDDEN_KEYS) {
      expect(raw).not.toContain(`"${key}"`);
    }

    // Answer every question (mcq_single -> exactly one radio each), moving
    // forward with "التالي" until the last question exposes "سلّم الامتحان"
    // directly.
    for (let i = 0; i < 3; i += 1) {
      await page.getByRole('radio').first().check();
      const nextButton = page.getByRole('button', { name: copy.quiz.next });
      if (await nextButton.isVisible().catch(() => false)) {
        await nextButton.click();
      }
    }

    // Confirm-before-submit with an unanswered count is deliberate: every
    // question was answered, so the dialog must report that explicitly.
    await page.getByRole('button', { name: copy.quiz.submit }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByText(copy.quiz.submitConfirmAllAnswered)).toBeVisible();
    await page.getByRole('button', { name: copy.quiz.submitConfirmAction }).click();

    await page.waitForURL('**/review');
    await expect(page.getByText(copy.quiz.resultsTitle)).toBeVisible();

    // Review shows per-question correctness -- and only here, never before
    // submission (asserted above).
    await expect(page.locator('[data-correctness]').first()).toBeVisible();
  });

  test('a resumed attempt keeps the same question order', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);

    await page.goto(`/quizzes/${QUIZ_DEMO_LESSON_ID}`);
    await page.getByRole('button', { name: copy.quiz.start }).click();
    await page.waitForURL(/\/quizzes\/.+\/attempt\/.+/);

    const before = await page.locator('[role="radiogroup"]').allInnerTexts();
    await page.reload();

    // option_order is snapshotted at attempt creation; without that snapshot
    // a reload would reshuffle the paper under the student.
    const after = await page.locator('[role="radiogroup"]').allInnerTexts();
    expect(after).toEqual(before);
  });
});
