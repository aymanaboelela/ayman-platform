'use client';

import { useEffect } from 'react';

/**
 * Writes the cursor position into two CSS custom properties that mask the
 * .dot-grid backdrop. Deliberately does NOT use React state: a setState per
 * pointermove would be a render + reconcile every frame, which is a documented
 * INP killer. Writing a custom property stays on the compositor.
 *
 * TODO(perf): register `--mx` / `--my` with `@property { syntax: '<length>';
 * inherits: true; initial-value: 0px }` in `app/globals.css`, so Blink can scope
 * the invalidation to the mask instead of treating an unregistered custom
 * property as potentially affecting anything. There is no `@property` anywhere
 * in `app/` or `packages/ui/src` today. Left undone here only because
 * `globals.css` belongs to another change in flight; the coarse-pointer gate
 * below is the part that actually mattered.
 */
export function DotGridSpotlight() {
  useEffect(() => {
    // Coarse pointers are gated for the same reason as reduced motion — and the
    // `(site)` layout's comment has claimed for a while that this component
    // already did that. It did not; only SplashCursorMount did.
    //
    // On Android Chrome `pointermove` fires for a touch pointer from touchdown
    // until the browser claims the gesture, so a handful of events land at the
    // start of every scroll and on every tap. Each one repaints a full-viewport
    // `mask-image` on the `position: fixed; inset: 0` layer sitting behind the
    // whole page (`.dot-grid`, globals.css) — at precisely the moment the user
    // is trying to start a scroll. The payoff is zero: with no hovering cursor
    // the 420px spotlight would sit at its `50% 30%` default anyway, so a phone
    // shows one static circle of dots however much the handler runs.
    //
    // One combined query rather than two `matchMedia` calls; the pair of
    // conditions is the same one `specular-buttons.tsx` and `spotlight-grid.tsx`
    // gate on.
    //
    // ⚠️ The gate stops here. Do NOT pair it with
    // `@media (pointer: coarse) { .dot-grid { mask-image: none } }` — that
    // deletes the marketing backdrop's vignette in both themes, which is a
    // design decision, not a performance fix.
    if (window.matchMedia('(prefers-reduced-motion: reduce), (pointer: coarse)').matches) {
      return;
    }

    let frame = 0;
    function onMove(event: PointerEvent) {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const root = document.documentElement;
        root.style.setProperty('--mx', `${event.clientX}px`);
        root.style.setProperty('--my', `${event.clientY}px`);
      });
    }

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
