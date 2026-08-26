import { expect, test } from '@playwright/test';

/**
 * On a phone the assistant is a sheet bound to the VISIBLE area, not a popover
 * anchored to the bottom of the layout viewport.
 *
 * ## The bug this replaces
 *
 * The first attempt measured the keyboard — `innerHeight - visualViewport.height`
 * — and lifted the panel by that much. It measured perfectly in an emulator and
 * broke on a real iPhone, because the premise was wrong: Safari pins `position:
 * fixed` to the LAYOUT viewport and then scrolls that viewport to reveal the
 * focused field. The ground moves on its own, underneath an offset calculated
 * against where it used to be, and the panel drifts and jumps.
 *
 * ⚠️ No automated browser can open a real on-screen keyboard — Playwright
 * included — so what is asserted here is the CONTRACT the sheet depends on:
 *
 *   1. the hook publishes the visual viewport's own numbers, unmodified;
 *   2. the sheet is placed at exactly those numbers;
 *   3. so when the keyboard changes them, the sheet is already correct.
 *
 * Point 2 is checked by moving the variables and watching the box follow —
 * which is what a keyboard does to them. It cannot prove Safari's behaviour;
 * it proves there is no arithmetic left in between to get wrong.
 */

const PHONE = { width: 390, height: 844 };

/*
 * Opened with a DOM click rather than `locator.click()`, for the reason
 * `assistant.e2e.ts` writes out at length: Playwright aims synthetic clicks in
 * VISUAL viewport coordinates while `position: fixed` anchors the launcher to
 * the LAYOUT viewport, so under mobile emulation it aims tens of pixels short
 * and reports whatever it landed on as an interceptor. Locally it also has to
 * get past Next's dev overlay, which parks itself in the same corner.
 *
 * Neither is a product fault, and neither is what these tests are about — the
 * launcher's own hit-testing is asserted properly in `assistant.e2e.ts`.
 */
async function openAssistant(page: import('@playwright/test').Page) {
  const launcher = page.getByRole('button', { name: 'فتح المساعد', exact: true });
  await launcher.waitFor();

  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find(
      (element) => element.getAttribute('aria-label') === 'فتح المساعد',
    );
    (button as HTMLButtonElement | undefined)?.click();
  });

  await page.locator('.assistant-panel').waitFor();
  // The panel scales in; settle before measuring.
  await page.waitForTimeout(500);
}

// The assistant widget is temporarily disabled — see `AssistantSlot`
// (components/assistant/assistant-slot.tsx). Whole file skipped until it's
// back, since every case here assumes the sheet actually renders.
test.describe.skip('the assistant on a phone', () => {
  test('publishes the visual viewport unmodified', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    await openAssistant(page);

    const reported = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        top: root.getPropertyValue('--assistant-vv-top').trim(),
        height: root.getPropertyValue('--assistant-vv-height').trim(),
        actualTop: `${Math.round(visualViewport!.offsetTop)}px`,
        actualHeight: `${Math.round(visualViewport!.height)}px`,
      };
    });

    // Equal, not merely close: any difference is arithmetic, and arithmetic is
    // what the previous version got wrong.
    expect(reported.top).toBe(reported.actualTop);
    expect(reported.height).toBe(reported.actualHeight);
  });

  test('covers the visible area', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    await openAssistant(page);

    const box = await page.locator('.assistant-panel').boundingBox();
    expect(box).not.toBeNull();

    expect(Math.round(box!.y)).toBe(0);
    expect(Math.round(box!.height)).toBe(PHONE.height);
    expect(Math.round(box!.width)).toBe(PHONE.width);
  });

  /*
   * The keyboard, as the sheet sees it: the visible area gets shorter and may
   * start further down. Nothing else about the page changes on iOS — which is
   * exactly why the sheet reads these two numbers rather than deriving them.
   */
  test('follows the visible area when it shrinks', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    await openAssistant(page);

    const KEYBOARD = 336;
    const OFFSET = 40;

    await page.evaluate(
      ({ height, offset }) => {
        const root = document.documentElement;
        root.style.setProperty('--assistant-vv-top', `${offset}px`);
        root.style.setProperty('--assistant-vv-height', `${height}px`);
      },
      { height: PHONE.height - KEYBOARD, offset: OFFSET },
    );

    const box = await page.locator('.assistant-panel').boundingBox();
    expect(Math.round(box!.y)).toBe(OFFSET);
    expect(Math.round(box!.height)).toBe(PHONE.height - KEYBOARD);

    // And the composer came with it, above where the keyboard would be.
    const composer = page.locator('.assistant-panel textarea').first();
    const cbox = await composer.boundingBox();
    expect(cbox).not.toBeNull();
    expect(cbox!.y + cbox!.height).toBeLessThanOrEqual(PHONE.height - KEYBOARD);
  });

  test('hides the floating launcher behind the sheet', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');

    const launcher = page.getByRole('button', { name: 'فتح المساعد', exact: true });
    await expect(launcher).toBeVisible();

    await openAssistant(page);
    await expect(launcher).toBeHidden();
  });

  /*
   * The sheet is a PHONE answer. On a desktop the panel is still a popover in
   * its corner, and a rule that leaked upward would replace the whole screen
   * with a chat box.
   */
  test('stays a corner popover on a desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await openAssistant(page);

    const box = await page.locator('.assistant-panel').boundingBox();
    expect(box!.width).toBeLessThan(500);
    expect(box!.height).toBeLessThan(700);
    expect(box!.y).toBeGreaterThan(0);
  });
});
