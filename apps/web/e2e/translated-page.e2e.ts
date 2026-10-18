import { expect, test } from '@playwright/test';

/**
 * A browser translator must not be able to take a page down.
 *
 * `/admin/errors` recorded the classic React crash twice — «Failed to execute
 * 'insertBefore' on 'Node'» on `/game` (Edge on Windows) and its `removeChild`
 * twin on a course page. A translator swaps React's text nodes for `<font>`
 * wrappers, and React's next commit asks the DOM about a node that is no longer
 * where it was left (facebook/react#11538).
 *
 * Two layers, both asserted here against the production build CI serves:
 * the page tells translators not to (`translate="no"`, Google's
 * `notranslate`), and `DOM_MUTATION_GUARD` in the prepaint script keeps the
 * DOM methods from throwing for anything that translates anyway. The guard is
 * exercised in the REAL browser's DOM, not jsdom's —
 * `lib/security/dom-mutation-guard.test.tsx` proves it against a real React
 * commit.
 */
test('tells translators not to touch the page', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('translate', 'no');
  await expect(page.locator('meta[name="google"]')).toHaveAttribute('content', 'notranslate');
});

test('installs the DOM guard before the app, and it holds in the browser’s own DOM', async ({ page }) => {
  await page.goto('/');

  const installed = await page.evaluate(() => !/\[native code\]/.test(String(Node.prototype.removeChild)));
  expect(installed, 'the prepaint script did not install the guard').toBe(true);

  // What a translator leaves behind: a text node moved into a <font> wrapper.
  // React then inserts before it and removes it, through its OLD parent.
  const outcome = await page.evaluate(() => {
    const parent = document.createElement('p');
    const text = document.createTextNode('نص');
    const tail = document.createElement('b');
    parent.append(text, tail);
    const font = document.createElement('font');
    parent.insertBefore(font, text);
    font.appendChild(text);

    const added = document.createElement('i');
    try {
      parent.insertBefore(added, text);
      parent.removeChild(text);
    } catch (error) {
      return `threw: ${String(error)}`;
    }
    return `${[...parent.childNodes].map((node) => node.nodeName).join(',')}|${font.childNodes.length}`;
  });

  // Inserted before the wrapper that holds the reference, and the text React
  // asked to remove is gone from inside it.
  expect(outcome).toBe('I,FONT,B|0');
});
