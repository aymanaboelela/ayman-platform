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
    // The navigator chips are the loop's anchor, in both directions: they say
    // which question is on screen and whether it has been answered yet.
    //
    // Driving this purely off "click the first visible radio, then click
    // التالي" was wrong twice over. It could fire the click while the OUTGOING
    // question was still on screen — answering the same question twice and
    // skipping the next one entirely — and it treated the radio's own checked
    // state as proof the runner had recorded the answer, when the runner's
    // state (which is what the submit dialog counts unanswered questions from)
    // updates a tick later. Both produced the same symptom: a submit dialog
    // reporting "لسه فيه 1 سؤال من غير إجابة" for a paper the run had answered
    // in full. `data-answered` exists for exactly this — see
    // `components/quiz/question-navigator.tsx`.
    const chips = page.locator('[data-answered]');
    await expect(chips).toHaveCount(3);

    for (let i = 0; i < 3; i += 1) {
      const chip = chips.nth(i);
      await expect(chip).toHaveAttribute('aria-current', 'step');

      await page.getByRole('radio').filter({ visible: true }).first().check();
      await expect(chip).toHaveAttribute('data-answered', 'true');

      const nextButton = page.getByRole('button', { name: copy.quiz.next }).filter({ visible: true });
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
    // `filter({ visible: true })` because Next's App Router keeps the OUTGOING
    // route in the document inside a `display: none` container rather than
    // detaching it, so a bare `getByText` here matches the attempt screen's
    // copy as well as the review screen's and trips strict mode. Same reason
    // the onboarding fixture filters — see `fixtures.ts`.
    await expect(page.getByText(copy.quiz.resultsTitle).filter({ visible: true })).toBeVisible();

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

    // Visible-only, and it matters here more than anywhere: the pre-reload
    // read happens on a client-side transition, where the previous route is
    // still in the document under `display: none`, while the post-reload read
    // happens on a fresh document with no leftovers. Comparing an unfiltered
    // collection compares "attempt + whatever preceded it" against "attempt",
    // which can never be equal — and says nothing about option order.
    const visibleGroups = page.locator('[role="radiogroup"]').filter({ visible: true });
    const before = await visibleGroups.allInnerTexts();
    await page.reload();

    // option_order is snapshotted at attempt creation; without that snapshot
    // a reload would reshuffle the paper under the student.
    const after = await visibleGroups.allInnerTexts();
    expect(after).toEqual(before);
  });
});
