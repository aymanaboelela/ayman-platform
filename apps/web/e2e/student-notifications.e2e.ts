import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { copy } from '@ayman/contracts';
import {
  QUIZ_DEMO_LESSON_ID,
  enrollInDemoCourse,
  registerAndOnboard,
  startAttempt,
  uniqueStudent,
} from './fixtures';

/**
 * In-app notifications: the bell, its badge, the panel, and read state.
 *
 * `quiz_graded` is the only one of the two kinds reachable end-to-end without
 * an admin session — `extra_attempt_granted` requires one, and the admin e2e
 * project is skipped without credentials. It is covered where it can be
 * exercised honestly: the emitter has an integration test in
 * `attempt-admin.service.spec.ts`, and the rendering of both is unit tested in
 * `notification-view.test.ts`.
 *
 * There was a third kind, `appeal_resolved`. Appeals are gone.
 */

/** Sits the seeded quiz once and submits it — which is what emits the row. */
async function sitTheQuiz(page: Page): Promise<void> {
  await page.goto(`/quizzes/${QUIZ_DEMO_LESSON_ID}`);
  await startAttempt(page);

  const chips = page.locator('[data-answered]');
  await expect(chips).toHaveCount(3);
  for (let i = 0; i < 3; i += 1) {
    await expect(chips.nth(i)).toHaveAttribute('aria-current', 'step');
    await page.getByRole('radio').filter({ visible: true }).first().check();
    await expect(chips.nth(i)).toHaveAttribute('data-answered', 'true');
    const next = page.getByRole('button', { name: copy.quiz.next }).filter({ visible: true });
    if (await next.isVisible().catch(() => false)) await next.click();
  }

  await page.getByRole('button', { name: copy.quiz.submit }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: copy.quiz.submitConfirmAction }).click();
  await page.waitForURL('**/review');
}

/** The bell's accessible name carries the count, so it IS the badge assertion. */
const bell = (page: Page) => page.getByRole('button', { name: new RegExp(copy.notifications.bell) });

test.describe('student notifications', () => {
  test('a new student has a bell with no badge and a designed empty panel', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await page.goto('/dashboard');

    // Exactly the plain label — no count in it, because zero unread means NO
    // badge. A permanent "0" trains a student to ignore the bell.
    await expect(page.getByRole('button', { name: copy.notifications.bell, exact: true })).toBeVisible();

    await bell(page).click();
    await expect(page.getByText(copy.notifications.empty)).toBeVisible();
  });

  test('submitting a quiz puts a badge on the bell', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);
    await sitTheQuiz(page);

    await page.goto('/dashboard');

    // The count lands in the accessible name — "الإشعارات — 1 جديدة".
    await expect(
      page.getByRole('button', { name: new RegExp(`${copy.notifications.bell}.*1`) }),
    ).toBeVisible();
  });

  test('opening a notification clears the badge and lands on the review', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);
    await sitTheQuiz(page);

    await page.goto('/dashboard');
    await bell(page).click();

    // The row states the score, composed on the client from `kind` + payload —
    // the API sends no prose at all.
    const row = page.getByRole('button', { name: /اتصحّحت ورقتك/ }).first();
    await expect(row).toBeVisible();
    await row.click();

    await page.waitForURL('**/review');

    // Back anywhere in the shell, the badge is gone: opening it marked it read
    // and the Server Action revalidated the layout the bell lives in.
    await page.goto('/dashboard');
    await expect(
      page.getByRole('button', { name: copy.notifications.bell, exact: true }),
    ).toBeVisible();
  });

  test('“mark all read” clears the badge from the full page', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);
    await sitTheQuiz(page);

    await page.goto('/notifications');
    await expect(page.getByRole('heading', { level: 1, name: copy.notifications.title })).toBeVisible();

    await page.getByRole('button', { name: copy.notifications.markAllRead }).first().click();

    // The control disappears once nothing is unread — and so does the badge.
    await expect(page.getByRole('button', { name: copy.notifications.markAllRead })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: copy.notifications.bell, exact: true }),
    ).toBeVisible();
  });

  test('has no serious or critical axe violations', async ({ page }, testInfo) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);
    await sitTheQuiz(page);

    await page.goto('/notifications');
    await expect(page.getByRole('heading', { level: 1, name: copy.notifications.title })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const blocking = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );

    await testInfo.attach('axe-notifications.json', {
      body: JSON.stringify(blocking, null, 2),
      contentType: 'application/json',
    });

    expect(
      blocking,
      `axe found ${blocking.length} blocking violation(s): ${blocking.map((v) => v.id).join(', ')}`,
    ).toEqual([]);
  });
});
