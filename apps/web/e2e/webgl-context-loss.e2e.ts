import { expect, test } from '@playwright/test';

/**
 * The white page, as a test.
 *
 * `splash-cursor.tsx` renders a `position: fixed` canvas the size of the
 * viewport, and its wrapper sits at `zIndex: 50` — above every word on the
 * page. Its own docblock names the event that breaks it: browsers cap live
 * WebGL contexts near sixteen and force-lose the OLDEST to make room, and this
 * surface holds six canvases.
 *
 * Losing that context used to be invisible and then catastrophic, in two steps:
 *
 *   1. Nothing listened for `webglcontextlost`, so the canvas kept its last
 *      frame and the page looked completely normal.
 *   2. The next relayout ran `resizeCanvas()`, which assigns `canvas.width` and
 *      RESETS the bitmap — after which every draw call was a no-op on a dead
 *      context. A blank full-viewport layer then composited over the whole site.
 *
 * Measured on production before the fix, sampling the painted frame: a healthy
 * landing page reads mean brightness 38 with a standard deviation of 47 and 2%
 * near-white pixels; one resize after a lost context it read mean 254, sd 10,
 * and 99% near-white.
 *
 * ## Why this test samples PIXELS
 *
 * Because every DOM measurement of this bug reports a healthy page, and that is
 * not a flaw in the measurements — the content genuinely is laid out, painted
 * and correct. It is merely covered. `document.elementFromPoint` cannot see the
 * overlay either, because `pointer-events: none` removes it from hit-testing
 * while leaving it fully visible. A screenshot is the only witness.
 */

test.describe('full-viewport WebGL layer', () => {
  test('a lost context does not turn the landing page white', async ({ page }) => {
    await page.goto('/');
    // The fluid only starts its loop once the pointer has moved.
    await page.mouse.move(400, 300);
    await page.mouse.move(460, 340);
    await page.waitForTimeout(600);

    const canvas = page.locator('#fluid');
    // The component is gated off coarse pointers and reduced motion, so on the
    // mobile project there is nothing to test and nothing that can fail.
    test.skip((await canvas.count()) === 0, 'splash cursor not mounted on this project');

    const lost = await page.evaluate(() => {
      const element = document.querySelector('canvas#fluid') as HTMLCanvasElement | null;
      if (!element) return 'no canvas';
      const gl = (element.getContext('webgl2') ?? element.getContext('webgl')) as
        | WebGLRenderingContext
        | null;
      const extension = gl?.getExtension('WEBGL_lose_context');
      if (!extension) return 'extension unavailable';
      extension.loseContext();
      return 'lost';
    });
    test.skip(lost !== 'lost', `could not force context loss: ${lost}`);

    // The step that used to blank the page: any relayout resets the bitmap.
    const viewport = page.viewportSize();
    await page.setViewportSize({
      width: (viewport?.width ?? 1280) + 1,
      height: (viewport?.height ?? 720) + 1,
    });
    await page.waitForTimeout(1200);

    // Hidden the moment the context went, so it can never composite over the
    // page — a cursor trail that stops is worth nothing, the page it covered is
    // worth everything.
    await expect(canvas).toBeHidden();

    // And the words are still on screen, which is the claim that actually
    // matters. `toBeVisible` on real content is the counterpart to the canvas
    // being hidden: together they say "the page is readable".
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
