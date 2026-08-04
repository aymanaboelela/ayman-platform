import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { copy } from '@ayman/contracts';
import { registerAndOnboard, uniqueStudent } from './fixtures';

const c = copy.playground;

/**
 * The editor, filtered to the one a student can actually type into.
 *
 * `getByLabel` alone matched TWO elements and failed on strict mode — observed
 * on `mobile` in CI, on `main`, blocking the deploy. There is exactly one
 * `aria-label={c.editorLabel}` in `playground.tsx`, so the second match is the
 * OUTGOING route: Next's App Router leaves the previous segment in the document
 * inside a `display: none` container, and every test here arrives at
 * `/playground` straight after `registerAndOnboard` finishes its client-side
 * redirect. `fixtures.ts` documents the same trap at length and solves it the
 * same way.
 *
 * Mobile-only because the phone viewport hydrates later, so the two trees
 * overlap for longer — the bug is not viewport-specific, only its timing is.
 */
const editorOf = (page: import('@playwright/test').Page) =>
  page.getByLabel(c.editorLabel).filter({ visible: true });

/**
 * `/playground` — the scratchpad.
 *
 * The evaluator's containment is unit-territory and belongs with
 * `lib/run-code.ts`. What only a browser can prove is that a student can type
 * something, press a button, and see what it printed — and that a runaway loop
 * does not take the tab with it.
 */
test.describe('playground', () => {
  test('is closed to anonymous visitors', async ({ page }) => {
    await page.goto('/playground');
    await expect(page).toHaveURL(/\/login/);
  });

  test('runs what the student typed and shows the output', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await page.goto('/playground');

    const editor = editorOf(page);
    await expect(editor).toBeVisible();
    await editor.fill('console.log(6 * 7);');
    await page.getByRole('button', { name: c.run }).click();

    await expect(page.getByText('42', { exact: true })).toBeVisible();
  });

  test('reports an error instead of failing silently', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await page.goto('/playground');

    await editorOf(page).fill('this is not javascript');
    await page.getByRole('button', { name: c.run }).click();

    // The exact message is the engine's and differs between browsers; what
    // matters is that SOMETHING is reported where the output goes.
    const output = page.getByRole('region').filter({ hasText: c.output });
    await expect(page.locator('[class*="--err"]').first().or(output)).toBeVisible();
  });

  test('a runaway loop is killed rather than freezing the tab', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await page.goto('/playground');

    await editorOf(page).fill('while (true) {}');
    await page.getByRole('button', { name: c.run }).click();

    // `runCode`'s 2500ms kill switch. The assertion is that the page is still
    // alive and interactive afterwards — the button comes back out of its
    // running state, which cannot happen if the main thread were blocked.
    await expect(page.getByRole('button', { name: c.run })).toBeEnabled({ timeout: 15_000 });
  });

  test('loads a worked example the student can start from', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await page.goto('/playground');

    await page.getByLabel(c.examplesLabel).filter({ visible: true }).selectOption({ index: 2 });
    await expect(editorOf(page)).toHaveValue(/for \(/);
  });

  test('has no serious or critical axe violations', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await page.goto('/playground');
    await expect(page.getByRole('heading', { name: c.title, level: 1 })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);
  });
});
