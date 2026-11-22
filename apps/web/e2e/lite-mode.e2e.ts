import { expect, test } from '@playwright/test';

/**
 * Lite mode on a real build (`lib/weak-device.ts`, PR #840): a machine whose
 * hints say weak gets `data-fx="lite"` before hydration, and none of the heavy
 * layers — no dragon clips, no WebGL canvases. The rest of the suite pins
 * `fx:mode=full` in `playwright.config.ts`; this spec clears it.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const hints = (cores: number) =>
  `Object.defineProperty(Navigator.prototype,'hardwareConcurrency',{get(){return ${cores}},configurable:true});` +
  `document.addEventListener('DOMContentLoaded',()=>{window.__fxAtDCL=document.documentElement.getAttribute('data-fx');});`;

test.describe('lite mode', () => {
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the heavy layers only exist on a wide, fine-pointer screen');
  });

  test('a weak machine gets the still page before hydration, without the heavy layers', async ({ page }) => {
    await page.addInitScript(hints(2));
    await page.goto('/');
    expect(await page.evaluate(() => (window as unknown as { __fxAtDCL: string | null }).__fxAtDCL)).toBe('lite');

    await page.mouse.wheel(0, 4000);
    await page.waitForTimeout(1500);
    const layers = await page.evaluate(() => ({
      fx: document.documentElement.getAttribute('data-fx'),
      videos: document.querySelectorAll('video').length,
      canvases: document.querySelectorAll('canvas').length,
    }));
    expect(layers).toEqual({ fx: 'lite', videos: 0, canvases: 0 });
  });

  test('the visitor’s own FULL beats the hints', async ({ page }) => {
    await page.addInitScript(`${hints(2)}try{localStorage.setItem('fx:mode','full')}catch(e){}`);
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-fx'))).toBeNull();
  });
});
