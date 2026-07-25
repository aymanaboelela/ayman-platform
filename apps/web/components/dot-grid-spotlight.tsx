'use client';

import { useEffect } from 'react';

/**
 * Writes the cursor position into two CSS custom properties that mask the
 * .dot-grid backdrop. Deliberately does NOT use React state: a setState per
 * pointermove would be a render + reconcile every frame, which is a documented
 * INP killer. Writing a custom property stays on the compositor.
 */
export function DotGridSpotlight() {
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (media.matches) return;

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
