import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SplashCursor from './splash-cursor';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * The regression here took down WHOLE PAGES, and it did it silently.
 *
 * `SplashCursor` is decoration — a full-viewport WebGL fluid mounted by
 * `(site)/layout.tsx`, so it is on `/`, `/terms`, `/years/*`, `/essentials` and
 * every other public route. Its effect already carried the right line,
 * `if (!gl || !ext) return`, and that line could never once have run, because
 * `getWebGLContext` threw instead of returning null. The throw escaped the
 * effect, hit the nearest `error.tsx`, and replaced the entire page with «فيه
 * حاجة بايظة» because a cursor effect could not start.
 *
 * Five rows on production's `/admin/errors` over three days. Two kinds of
 * client: a student on Chrome/macOS and later Android with no usable WebGL
 * (blocklisted GPU, or hardware acceleration off), and `facebookexternalhit` /
 * `meta-externalagent` — Meta's headless link-preview fleet, which has no GPU at
 * all, so every share of this site on Facebook, Messenger or WhatsApp was
 * scraping an error page.
 *
 * ## Why jsdom is the right harness and not a compromise
 *
 * jsdom implements no WebGL whatsoever, so `canvas.getContext('webgl2')` here
 * returns null exactly as it does on the devices that were breaking. This test
 * is not simulating the condition — it IS the condition. On the old code these
 * cases throw during render; the whole assertion is that they no longer do.
 */
describe('SplashCursor without WebGL', () => {
  it('renders instead of throwing when no WebGL context exists', () => {
    // jsdom returns null for every webgl context, which is the failing device.
    expect(document.createElement('canvas').getContext('webgl2')).toBeNull();

    expect(() => render(<SplashCursor />)).not.toThrow();
  });

  it('still mounts its canvas, so the page keeps its layout', () => {
    // Bailing out must leave the element in place rather than unmounting it —
    // the effect returns early, it does not tear the tree down.
    const { container } = render(<SplashCursor />);
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('survives a context that exists but reports no usable float formats', () => {
    // The SECOND throw, and a distinct device class: a driver that hands back a
    // context and then refuses every half-float render target. It was its own
    // production row («Unable to initialize WebGL render texture formats.», 3
    // occurrences on `/`), so it gets its own case.
    //
    // A context stub whose every method is a no-op and whose `checkFramebufferStatus`
    // never returns COMPLETE puts `getSupportedFormat` down the unsupported path.
    const stub = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === 'drawBuffers') return () => {};
          // Enum reads must be numbers, calls must be harmless.
          return typeof prop === 'string' && /^[A-Z0-9_]+$/.test(prop) ? 1 : () => null;
        },
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      stub as unknown as RenderingContext,
    );

    expect(() => render(<SplashCursor />)).not.toThrow();
  });
});
