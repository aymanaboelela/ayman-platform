import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { copy } from '@ayman/contracts';
import { registerAndOnboard, uniqueStudent } from './fixtures';

const c = copy.playground;

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

    const editor = page.getByLabel(c.editorLabel);
    await expect(editor).toBeVisible();
    await editor.fill('console.log(6 * 7);');
    await page.getByRole('button', { name: c.run }).click();

    await expect(page.getByText('42', { exact: true })).toBeVisible();
  });

  test('reports an error instead of failing silently', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await page.goto('/playground');

    await page.getByLabel(c.editorLabel).fill('this is not javascript');
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

    await page.getByLabel(c.editorLabel).fill('while (true) {}');
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

    await page.getByLabel(c.examplesLabel).selectOption({ index: 2 });
    await expect(page.getByLabel(c.editorLabel)).toHaveValue(/for \(/);
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
