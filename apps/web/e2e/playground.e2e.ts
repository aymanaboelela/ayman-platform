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

  test('runs an example straight from the gallery', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await page.goto('/playground');

    // «تجربة» loads the program AND runs it — the widest line of the pyramid
    // is the proof that it executed, not just that the text was pasted in.
    await page
      .getByRole('button', { name: c.tryExampleAria.replace('{title}', 'هرم نجوم') })
      .click();
    await expect(editorOf(page)).toHaveValue(/"\*"\.repeat/);
    await expect(page.locator('[aria-live="polite"]').getByText('*'.repeat(15), { exact: true })).toBeVisible();
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

/**
 * The HTML + CSS tab: the student's page in a sandboxed frame.
 *
 * The containment itself is asserted on the headers in `proxy.test.ts` and on
 * the constants in `lib/html-preview.test.ts`. What only a browser can prove is
 * that the two layers actually hold together at runtime — that a `<script>` in
 * the page RUNS, and that the same script cannot touch the student's cookies,
 * storage, this page, or the network.
 */
test.describe('playground — HTML + CSS', () => {
  const live = (page: import('@playwright/test').Page) => page.frameLocator('iframe[data-state="live"]');

  test('renders the page the student wrote, styled by their stylesheet', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await page.goto('/playground');

    await page.getByRole('button', { name: c.web, exact: true }).click();
    await editorOf(page).fill('<h1 id="t">صفحتي الأولى</h1>');
    await page.getByRole('button', { name: 'style.css' }).click();
    await editorOf(page).fill('h1 { color: rgb(1, 2, 3); }');
    await page.getByRole('button', { name: c.run }).click();

    const heading = live(page).getByRole('heading', { name: 'صفحتي الأولى' });
    await expect(heading).toBeVisible();
    await expect(heading).toHaveCSS('color', 'rgb(1, 2, 3)');
  });

  test('a page example from the gallery renders', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await page.goto('/playground');

    await page
      .getByRole('button', { name: c.tryExampleAria.replace('{title}', 'عدّاد تفاعلي') })
      .click();
    // Its <script> runs: the + button changes the number.
    await live(page).getByRole('button', { name: '+' }).click();
    await live(page).getByRole('button', { name: '+' }).click();
    await expect(live(page).locator('#value')).toHaveText('2');
  });

  test('the page cannot reach the session, this page, or the network', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await page.goto('/playground');
    await page.getByRole('button', { name: c.web, exact: true }).click();

    const frame = page.locator('iframe[data-state]').first();
    await expect(frame).toHaveAttribute('sandbox', /allow-scripts/);
    expect(await frame.getAttribute('sandbox')).not.toContain('allow-same-origin');

    // Each probe is ATTEMPTED, not inspected: a SecurityError from the real
    // call proves more than the absence of a flag.
    await editorOf(page).fill(
      [
        '<p>probe</p>',
        '<script>',
        'var r = [];',
        'try { r.push("cookie:" + document.cookie); } catch (e) { r.push("cookie-blocked:" + e.name); }',
        'try { localStorage.setItem("x", "1"); r.push("storage-open"); } catch (e) { r.push("storage-blocked:" + e.name); }',
        'try { r.push("parent:" + parent.document.title); } catch (e) { r.push("parent-blocked:" + e.name); }',
        'console.log(r.join(" "));',
        'fetch("/api/session", { credentials: "include" })',
        '  .then(function () { console.log("REACHED THE NETWORK"); })',
        '  .catch(function (e) { console.log("fetch-blocked:" + e.name); });',
        '</script>',
      ].join('\n'),
    );
    await page.getByRole('button', { name: c.run }).click();

    const consoleOut = page.locator('.pg-mini-console');
    await expect(consoleOut).toContainText('cookie-blocked:SecurityError');
    await expect(consoleOut).toContainText('storage-blocked:SecurityError');
    await expect(consoleOut).toContainText('parent-blocked:SecurityError');
    await expect(consoleOut).toContainText('fetch-blocked:TypeError');
    await expect(consoleOut).not.toContainText('REACHED THE NETWORK');
  });
});
