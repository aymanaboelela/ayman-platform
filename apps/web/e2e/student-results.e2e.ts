import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { copy } from '@ayman/contracts';
import {
  QUIZ_DEMO_LESSON_ID,
  enrollInDemoCourse,
  registerAndOnboard,
  uniqueStudent,
} from './fixtures';

/**
 * The student's results screen, and the two gaps it closes on the quiz page.
 *
 * The seeded demo quiz has three `mcq_single` questions whose FIRST option is
 * the correct one (`quiz-fixtures.ts`), so answering "the first radio" every
 * time scores 100% deterministically. That is what makes the assertions here
 * exact numbers rather than ranges.
 */

/**
 * Sits the seeded quiz once and submits it, leaving the browser on the review
 * screen. Lifted verbatim in shape from `quiz-attempt-review.e2e.ts`, whose
 * comments explain why the loop anchors on `[data-answered]` rather than on
 * the radio's own checked state — the runner records an answer a tick after
 * the input flips, and driving off the input answers one question twice.
 */
async function sitTheQuiz(page: Page): Promise<void> {
  await page.goto(`/quizzes/${QUIZ_DEMO_LESSON_ID}`);
  await page.getByRole('button', { name: copy.quiz.start }).click();

  const chips = page.locator('[data-answered]');
  await expect(chips).toHaveCount(3);

  for (let i = 0; i < 3; i += 1) {
    const chip = chips.nth(i);
    await expect(chip).toHaveAttribute('aria-current', 'step');
    await page.getByRole('radio').filter({ visible: true }).first().check();
    await expect(chip).toHaveAttribute('data-answered', 'true');

    const next = page.getByRole('button', { name: copy.quiz.next }).filter({ visible: true });
    if (await next.isVisible().catch(() => false)) await next.click();
  }

  await page.getByRole('button', { name: copy.quiz.submit }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: copy.quiz.submitConfirmAction }).click();
  await page.waitForURL('**/review');
}

test.describe('student results', () => {
  test('shows the designed empty state before any quiz has been sat', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    await page.goto('/results');

    // Not an error and not a blank page — this is the state every new student
    // is in, so it is designed rather than deferred.
    //
    // `filter({ visible: true })`: Next's App Router keeps the OUTGOING route
    // segment in the document inside a `display: none` container rather than
    // detaching it, so a bare `getByText` matches this copy twice and trips
    // strict mode. `fixtures.ts` documents the same behaviour at length.
    await expect(page.getByText(copy.results.emptyTitle).filter({ visible: true })).toHaveCount(1);
    await expect(
      page.getByRole('link', { name: copy.results.emptyCta }).filter({ visible: true }),
    ).toBeVisible();
  });

  test('reports a submitted attempt in the summary and the per-quiz list', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);
    await sitTheQuiz(page);

    await page.goto('/results');

    await expect(page.getByRole('heading', { level: 1, name: copy.results.title })).toBeVisible();

    // The summary tiles are present and the empty state is gone.
    await expect(page.getByText(copy.results.statQuizzes).filter({ visible: true })).toHaveCount(1);
    await expect(page.getByText(copy.results.statAttempts).filter({ visible: true })).toHaveCount(1);
    await expect(page.getByText(copy.results.emptyTitle)).toHaveCount(0);

    // Exactly one quiz row, carrying its review link.
    //
    // Deliberately NOT asserting a specific percentage. The seeded demo quiz
    // is not `seedQuizFixture`'s deterministic paper — it comes from
    // `seed-admin.ts` and its options are shuffled per attempt, so "check the
    // first radio" scores whatever it scores. `quiz-attempt-review.e2e.ts`
    // avoids asserting a score for the same reason. What matters here is that
    // the attempt is REPORTED, which is the thing that did not exist before.
    const reviewLinks = page.getByRole('link', { name: copy.quiz.reviewAnswers }).filter({
      visible: true,
    });
    await expect(reviewLinks).toHaveCount(1);

    // A graded attempt exists, so the average tile must show a number rather
    // than the "لسه" placeholder a student with nothing graded sees.
    await expect(page.getByText(copy.results.noneYet, { exact: true })).toHaveCount(0);
  });

  test('the review link from the results page opens the student’s own answers', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);
    await sitTheQuiz(page);

    await page.goto('/results');
    await page.getByRole('link', { name: copy.quiz.reviewAnswers }).first().click();

    await page.waitForURL('**/review');
    // Per-question correctness renders only on review, never before
    // submission — `quiz-attempt-review.e2e.ts` asserts the "never before"
    // half; this asserts the route is actually reachable from the product,
    // which until this slice it was not from anywhere.
    await expect(page.locator('[data-correctness]').first()).toBeVisible();
  });

  test('a past attempt on the quiz page links to its review', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);
    await sitTheQuiz(page);

    await page.goto(`/quizzes/${QUIZ_DEMO_LESSON_ID}`);

    // The regression this guards: these rows rendered as inert cards, so the
    // fully-built review screen was reachable from nowhere in the product.
    const attempt = page.getByRole('link', { name: /المحاولة رقم/ }).filter({ visible: true });
    await expect(attempt).toHaveCount(1);
    await attempt.click();

    await page.waitForURL('**/review');
    await expect(page.locator('[data-correctness]').first()).toBeVisible();
  });

  test('the quiz page calls a second sitting a retake, not a start', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);
    await sitTheQuiz(page);

    await page.goto(`/quizzes/${QUIZ_DEMO_LESSON_ID}`);

    // The demo quiz is practice mode with unlimited attempts, so the control
    // is present — and must now say which sitting this is.
    await expect(page.getByRole('button', { name: copy.quiz.retryQuiz })).toBeVisible();
    await expect(page.getByRole('button', { name: copy.quiz.start })).toHaveCount(0);
  });

  test('has no serious or critical axe violations', async ({ page }, testInfo) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);
    await sitTheQuiz(page);

    await page.goto('/results');
    await expect(page.getByRole('heading', { level: 1, name: copy.results.title })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const blocking = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );

    await testInfo.attach('axe-results.json', {
      body: JSON.stringify(blocking, null, 2),
      contentType: 'application/json',
    });

    expect(
      blocking,
      `axe found ${blocking.length} blocking violation(s) on /results: ${blocking
        .map((violation) => violation.id)
        .join(', ')}`,
    ).toEqual([]);
  });
});
