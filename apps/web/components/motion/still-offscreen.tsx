'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A box whose infinite CSS loops stop while it is off screen.
 *
 * It only writes `data-still` on itself; the stylesheet does the pausing,
 * through an inherited custom property each loop reads into
 * `animation-play-state` (see `practice.css`, and the same idea in the board
 * preset — `board-motion.tsx`, `--board-play`). A property, not a
 * `[data-still] * { animation-play-state: paused }` rule, because every loop
 * sets the `animation` shorthand, which resets the play state, and most of
 * them out-specify a generic descendant rule.
 *
 * Why it exists: the dragon showcase runs 23 infinite animations (14 embers,
 * five bubbles, the halo, the frame, the photo, the shine) for as long as the
 * page is open. On a phone each one is a style recalc per frame, below the
 * fold, where nobody is looking — Lighthouse mobile put the landing at 13.5 s
 * of style and layout (2026-11-23).
 *
 * Starts STILL in the server HTML: the loops begin only once the client has
 * seen the box on screen, so nothing ticks during the load, when the main
 * thread is busiest. The cost is that a showcase in the first screen (the
 * `/practice` hero) starts moving at hydration rather than at first paint.
 */
export function StillOffscreen({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // No observer (very old browsers): let the loops run, as before.
    if (typeof IntersectionObserver === 'undefined') {
      el.removeAttribute('data-still');
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) el.removeAttribute('data-still');
        else el.setAttribute('data-still', '');
      },
      // A little early, so a loop is already moving when it scrolls in.
      { rootMargin: '120px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={className} aria-hidden="true" data-still="">
      {children}
    </div>
  );
}
