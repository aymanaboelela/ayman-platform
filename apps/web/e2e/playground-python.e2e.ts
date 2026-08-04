import { expect, test } from '@playwright/test';
import { copy } from '@ayman/contracts';
import { registerAndOnboard, uniqueStudent } from './fixtures';

const c = copy.playground;

/**
 * The output panel, and never the page.
 *
 * `getByText` over the whole document also matches the TEXTAREA's value — so
 * asserting that "REACHED THE NETWORK" is absent found it in the source code
 * the test had just typed and failed. Every assertion about what a program
 * PRINTED has to be scoped to where printing lands. `aria-live="polite"` is
 * that region's own attribute, not a hook added for tests.
 */
const output = (page: import('@playwright/test').Page) => page.locator('[aria-live="polite"]');

/**
 * Python in the playground.
 *
 * Separate from `playground.e2e.ts` because every test here pays for a 13.5 MB
 * interpreter to boot, and the JavaScript suite should not. The timeouts are
 * generous for the same reason — this is a wasm instantiation, not a fetch.
 */
test.describe('playground — Python', () => {
  test.describe.configure({ timeout: 180_000 });

  test('does not download the interpreter until the student asks', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    const wasmRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/pyodide/')) wasmRequests.push(request.url());
    });

    await page.goto('/playground');
    // Switching language alone must cost nothing — the whole point of making
    // the download its own button.
    await page.getByRole('button', { name: c.python, exact: true }).click();
    await expect(page.getByLabel(c.editorLabel)).toHaveValue(/print\(/);
    await page.waitForTimeout(1500);

    expect(wasmRequests).toEqual([]);
    await expect(page.getByRole('button', { name: c.pythonLoad })).toBeVisible();
  });

  test('runs real Python once loaded, and prints what it printed', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await page.goto('/playground');

    await page.getByRole('button', { name: c.python, exact: true }).click();
    await page.getByRole('button', { name: c.pythonLoad }).click();

    // Boot. The Run button reappearing is the signal the interpreter arrived.
    await expect(page.getByRole('button', { name: c.run })).toBeVisible({ timeout: 150_000 });

    await page.getByLabel(c.editorLabel).fill('print(sum(range(1, 11)))');
    await page.getByRole('button', { name: c.run }).click();

    // 55 — arithmetic a JavaScript engine would not produce from this source,
    // so this passing means CPython really executed it.
    await expect(output(page).getByText('55', { exact: true })).toBeVisible({ timeout: 60_000 });
  });

  test('shows the real Python traceback rather than swallowing it', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await page.goto('/playground');

    await page.getByRole('button', { name: c.python, exact: true }).click();
    await page.getByRole('button', { name: c.pythonLoad }).click();
    await expect(page.getByRole('button', { name: c.run })).toBeVisible({ timeout: 150_000 });

    await page.getByLabel(c.editorLabel).fill('print(undefined_name)');
    await page.getByRole('button', { name: c.run }).click();

    // The exact Python error class, not "something went wrong". It is the most
    // useful thing a beginner can be handed.
    await expect(output(page).getByText(/NameError/)).toBeVisible({ timeout: 60_000 });
  });

  test('the interpreter cannot reach the network once student code runs', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await page.goto('/playground');

    await page.getByRole('button', { name: c.python, exact: true }).click();
    await page.getByRole('button', { name: c.pythonLoad }).click();
    await expect(page.getByRole('button', { name: c.run })).toBeVisible({ timeout: 150_000 });

    // THE security assertion. A worker inherits the page's origin, so without
    // the teardown in `public/python-worker.js` this would reach our own API
    // carrying the signed-in student's cookies. `js.fetch` is how Python gets
    // at the host's `fetch` through Pyodide's FFI.
    //
    // The call is ATTEMPTED rather than merely inspected: proving the binding
    // is `None` proves less than proving a real request cannot be made.
    await page.getByLabel(c.editorLabel).fill(
      [
        'import js',
        'try:',
        '    js.fetch("/api/session")',
        '    print("REACHED THE NETWORK")',
        'except Exception as e:',
        '    print("blocked:", type(e).__name__)',
      ].join('\n'),
    );
    await page.getByRole('button', { name: c.run }).click();

    await expect(output(page).getByText(/blocked: TypeError/)).toBeVisible({ timeout: 60_000 });
    await expect(output(page).getByText('REACHED THE NETWORK')).toHaveCount(0);
  });

  test('the fetch and XHR bindings are gone, not merely guarded', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await page.goto('/playground');

    await page.getByRole('button', { name: c.python, exact: true }).click();
    await page.getByRole('button', { name: c.pythonLoad }).click();
    await expect(page.getByRole('button', { name: c.run })).toBeVisible({ timeout: 150_000 });

    // `None` is what a Python view of a deleted JS global looks like through
    // Pyodide's FFI — the assertion is written against that, not against the
    // JavaScript spelling, which is what the first version of this test got
    // wrong and only a real browser could have told me.
    await page.getByLabel(c.editorLabel).fill(
      'import js\nprint("fetch:", repr(js.fetch), "xhr:", repr(js.XMLHttpRequest))',
    );
    await page.getByRole('button', { name: c.run }).click();

    await expect(output(page).getByText('fetch: None xhr: None')).toBeVisible({ timeout: 60_000 });
  });
});
