import type { PresetMotionConfig } from './preset-gsap';

/**
 * Loads the GSAP layer AFTER hydration and wires it onto `root`; returns the
 * teardown. A dynamic import on purpose: GSAP + ScrollTrigger stay out of the
 * landing page's first JS, and a module that registers ScrollTrigger at
 * import time (`lib/gsap.ts`) never runs in a test that only renders the page.
 * A teardown that lands before the chunk does simply cancels the mount.
 */
export function mountPresetMotion(root: HTMLElement, config: PresetMotionConfig): () => void {
  let off: (() => void) | undefined;
  let cancelled = false;
  void import('./preset-gsap')
    .then(({ runPresetMotion }) => {
      if (!cancelled) off = runPresetMotion(root, config);
    })
    // A failed chunk is a page with no ornament, never a broken page.
    .catch(() => undefined);
  return () => {
    cancelled = true;
    off?.();
  };
}
