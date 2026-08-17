import { expect, test } from '@playwright/test';
import { copy } from '@ayman/contracts';
import {
  QUIZ_DEMO_LESSON_ID,
  enrollInDemoCourse,
  registerAndOnboard,
  startAttempt,
  uniqueStudent,
} from './fixtures';

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
    // The gate stands between the button and the POST, so the response wait
    // is armed around the GATE's confirm rather than around the start button.
    await page.getByRole('button', { name: copy.quiz.start }).click();
    const [attemptResponse] = await Promise.all([
      page.waitForResponse(
        (res) => /\/api\/quiz\/quizzes\/.+\/attempts$/.test(res.url()) && res.request().method() === 'POST',
      ),
      page.getByRole('button', { name: copy.examGate.agree }).click(),
    ]);
    const raw = await attemptResponse.text();
    for (const key of FORBIDDEN_KEYS) {
      expect(raw).not.toContain(`"${key}"`);
    }

    // Answer every question (mcq_single -> exactly one radio each), moving
    // forward with "التالي" until the last question exposes "تسليم الامتحان"
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

      // `exact: true`, for the same reason the publish toggles need it:
      // `name` matches a substring by default, and this quiz renders inside
      // the lesson player, which ALWAYS mounts `LessonNav` alongside it
      // (`lesson-player.tsx` has no condition on lesson kind). That nav's
      // finish button reads `خلاص · التالي` whenever the lesson has a next
      // one -- and that contains `التالي`. The only reason this passes today
      // is that the fixture course has a single lesson, so the label falls
      // back to `markCompleteFinal` (`الدرس خلص`), which does not. Give the
      // fixture a second lesson and a bare locator matches two buttons and
      // dies in strict mode, nowhere near the change that caused it.
      const nextButton = page
        .getByRole('button', { name: copy.quiz.next, exact: true })
        .filter({ visible: true });
      if (await nextButton.isVisible().catch(() => false)) {
        await nextButton.click();
      }
    }

    // Confirm-before-submit with an unanswered count is deliberate: every
    // question was answered, so the dialog must report that explicitly.
    // `openSubmitDialog` awaits the autosave flush before opening precisely
    // so this is deterministic; nothing here has to wait for the write.
    await page.getByRole('button', { name: copy.quiz.submit }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(copy.quiz.submitConfirmAllAnswered)).toBeVisible();
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
    await startAttempt(page);

    // Visible-only, and it matters here more than anywhere: the pre-reload
    // read happens on a client-side transition, where the previous route is
    // still in the document under `display: none`, while the post-reload read
    // happens on a fresh document with no leftovers. Comparing an unfiltered
    // collection compares "attempt + whatever preceded it" against "attempt",
    // which can never be equal — and says nothing about option order.
    const visibleGroups = page.locator('[role="radiogroup"]').filter({ visible: true });

    // `allInnerTexts()` is NOT an auto-waiting assertion — it resolves against
    // whatever matches at that instant and returns `[]` when nothing does,
    // silently. `waitForURL` above only proves the URL changed, not that the
    // paper has rendered, so on the mobile project this read regularly landed
    // in the gap and captured an empty `before`. The failure then surfaced at
    // the comparison on the last line as `[] !== [one question]`, which reads
    // like the reload reshuffled the paper — the exact bug this test exists to
    // catch — when nothing had reshuffled at all. Both reads are therefore
    // gated on an assertion that does wait.
    await expect(visibleGroups).not.toHaveCount(0);
    const before = await visibleGroups.allInnerTexts();
    await page.reload();

    // option_order is snapshotted at attempt creation; without that snapshot
    // a reload would reshuffle the paper under the student. Waiting on the
    // same COUNT first keeps a slow re-render from being reported as a
    // reordering; a genuine reshuffle still fails on the text comparison.
    await expect(visibleGroups).toHaveCount(before.length);
    const after = await visibleGroups.allInnerTexts();
    expect(after).toEqual(before);
  });
});
