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

  /**
   * The round trip — and the reason the test above passed on a broken build.
   *
   * Everything above forces the loss from OUTSIDE, on a freshly loaded page,
   * with the handler attached. That is the rare case. The common one is
   * self-inflicted and arrives through ordinary navigation: the effect's own
   * cleanup called `loseContext()` AFTER removing the `webglcontextlost`
   * listener, and `loseContext` dispatches asynchronously — measured 18ms
   * later — so the guard was gone before the event it exists to catch.
   *
   * `cacheComponents: true` is what turned that into an outage rather than a
   * dead cursor trail: every route segment lives inside a React `<Activity>`,
   * so leaving `(site)` HIDES it instead of unmounting it. The canvas element
   * survives, comes back, and `getContext` hands the effect the same LOST
   * context — which composites opaque, full-viewport, over everything.
   *
   * Reported as: open the landing page, press «تسجيل الدخول», come back, and
   * the page is white. First round trip, every time.
   *
   * ## Byte size, not brightness
   *
   * A JPEG of a blank sheet compresses to almost nothing and a JPEG of the
   * landing page does not — measured 5,887 bytes against 57-65KB. That gap is
   * three orders of magnitude wider than any anti-aliasing noise, needs no
   * image decoder in the test, and is a PIXEL measurement, which is the only
   * kind that can see this bug at all.
   */
  test('a round trip through sign-in leaves the landing page painted', async ({ page }) => {
    await page.goto('/');
    await page.mouse.move(400, 300);
    await page.waitForTimeout(600);

    test.skip(
      (await page.locator('#fluid').count()) === 0,
      'splash cursor not mounted on this project',
    );

    const paintedBytes = async () => {
      const shot = await page.screenshot({
        type: 'jpeg',
        quality: 50,
        clip: { x: 0, y: 200, width: 1000, height: 500 },
      });
      return shot.byteLength;
    };

    const healthy = await paintedBytes();
    // Sanity on the baseline itself: if the page were ALREADY blank, every
    // assertion below would pass against nothing.
    expect(healthy).toBeGreaterThan(15_000);

    // Twice, because a leak-shaped cause would only show on a later trip. The
    // real one shows on the first.
    for (let trip = 1; trip <= 2; trip += 1) {
      // A REAL in-page link. `createElement('a').click()` would do a full
      // document load, which rebuilds everything and is the one condition
      // under which this bug cannot happen.
      await page.getByRole('link', { name: /تسجيل الدخول/ }).first().click();
      await page.waitForURL(/\/login/);
      await page.goBack();
      await page.waitForURL((url) => !url.pathname.startsWith('/login'));
      await page.waitForTimeout(1200);

      const after = await paintedBytes();
      expect(after, `landing page went blank after round trip ${trip}`).toBeGreaterThan(
        healthy / 3,
      );
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });
});
