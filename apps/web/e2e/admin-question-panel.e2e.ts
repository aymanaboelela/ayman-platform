import { expect, test } from '@playwright/test';
import { copy } from '@ayman/contracts/copy/admin';
import { QUIZ_DEMO_LESSON_ID, loginAsAdmin } from './fixtures';

/**
 * Opening a question from inside the exam it belongs to.
 *
 * ## Why this exists as an e2e at all
 *
 * The unit tests around this feature are honest about their own scope: the
 * service spec proves `hydrate` returns a `bankEntryId`, and
 * `slot-list.test.tsx` proves a collapsed row fetches nothing and an open one
 * fetches once — against a MOCKED `apiGet`. Neither of them proves the id the
 * server actually sends is the id the panel actually asks for, or that the
 * question comes back through the real route with the real guard in front of
 * it. Every part of that chain was green in isolation while the feature had
 * never once been run end to end by anybody.
 *
 * ## The seeded exam
 *
 * `/admin/quizzes/lesson/:lessonId` is get-or-create and redirects to the
 * builder, so this reaches the demo quiz without hardcoding a quiz id that
 * `seed-admin.ts` does not export.
 */
test.describe('admin exam builder — the question opens in place', () => {
  test('a question row expands into its options, its correct answer, and its mark in THIS exam', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto(`/admin/quizzes/lesson/${QUIZ_DEMO_LESSON_ID}`);
    await expect(page).toHaveURL(/\/admin\/quizzes\/[0-9a-f-]+$/);

    // Found by its STEM, which is the row's accessible name — the way an
    // instructor points at a question, and not a test id. Not
    // `button[aria-expanded]`: the admin shell has its own disclosure buttons,
    // and the first one on the page is in the sidebar, off-screen.
    // `seed-admin.ts` writes «سؤال تجريبي رقم 1..3».
    const firstQuestion = page.getByRole('button', { name: /سؤال تجريبي رقم/ }).first();
    await expect(firstQuestion).toBeVisible();
    await expect(firstQuestion).toHaveAttribute('aria-expanded', 'false');

    await firstQuestion.click();
    await expect(firstQuestion).toHaveAttribute('aria-expanded', 'true');

    // What the instructor came for: the editable question, not a summary.
    // `stem` is the field label, so this asserts the FORM rendered — a panel
    // that fetched and failed would show the retry line instead.
    await expect(page.getByLabel(copy.quizAdmin.stem)).toBeVisible();
    // `exact`: «الاختيارات» is a substring of the settings form's «رتّب
    // الاختيارات عشوائيًا» further up the same page, and a loose match is a
    // strict-mode violation rather than a passing assertion.
    await expect(page.getByText(copy.quizAdmin.options, { exact: true })).toBeVisible();
    // The correct-answer control is the whole point of "أشوف كل حاجة فيه".
    await expect(page.getByText(copy.quizAdmin.markCorrect).first()).toBeVisible();

    // The mark that decides THIS exam, and — deliberately — not the bank's
    // default, which is hidden in the embedded form. If both were on screen
    // the instructor would have two numbers and no way to tell which counts.
    await expect(page.getByLabel(copy.quizAdmin.slotMark)).toBeVisible();
    await expect(page.getByLabel(copy.quizAdmin.defaultMark)).toBeHidden();

    // The other two seeded questions stay shut — opening one row does not
    // open the list.
    await expect(
      page.getByRole('button', { name: /سؤال تجريبي رقم/, expanded: true }),
    ).toHaveCount(1);
  });

  test('collapsing keeps the question — reopening does not start over', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/admin/quizzes/lesson/${QUIZ_DEMO_LESSON_ID}`);
    await expect(page).toHaveURL(/\/admin\/quizzes\/[0-9a-f-]+$/);

    const row = page.getByRole('button', { name: /سؤال تجريبي رقم/ }).first();
    await row.click();
    const stem = page.getByLabel(copy.quizAdmin.stem);
    await expect(stem).toBeVisible();

    // Type something WITHOUT saving. This is the half a component test cannot
    // assert against a mock: an accidental collapse must not throw away work.
    await stem.fill('مسودة مش متحفوظة');

    await row.click();
    await expect(row).toHaveAttribute('aria-expanded', 'false');
    await expect(stem).toBeHidden();

    await row.click();
    await expect(row).toHaveAttribute('aria-expanded', 'true');
    await expect(stem).toHaveValue('مسودة مش متحفوظة');
  });
});
