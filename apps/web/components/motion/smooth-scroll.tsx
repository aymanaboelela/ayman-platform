'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';
import { gsap, ScrollTrigger } from '@/lib/gsap';

/**
 * Momentum scrolling for the marketing surface, mounted once in the `(site)`
 * layout. The app, admin and quiz surfaces keep native scrolling — hijacking
 * the scroller under a graded attempt or a long admin table is a liability, not
 * a flourish.
 *
 * Three wiring details, all load-bearing:
 *
 * - Lenis is driven from GSAP's ticker instead of its own `requestAnimationFrame`
 *   loop. Two independent rAF loops means Lenis can write `scrollTop` after
 *   ScrollTrigger has already read it that frame, which shows up as pinned
 *   sections lagging one frame behind the content.
 * - `lagSmoothing(0)` disables GSAP's catch-up behaviour. Its default is to
 *   assume a long frame was a stall and skip ahead, which with a smoothed
 *   scroller reads as a jump.
 * - `ScrollTrigger.update` on every Lenis `scroll` event: Lenis moves the page
 *   without emitting native scroll events that ScrollTrigger listens for.
 *
 * Under `prefers-reduced-motion: reduce` this component mounts nothing at all.
 * Smoothed scrolling IS motion the user did not ask for, and a degraded
 * emulation is worse than the native scroller.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const lenis = new Lenis({
      duration: 1.05,
      // Matches the reference's feel: fast start, long tail, no overshoot.
      easing: (t) => Math.min(1, 1.001 - 2 ** (-10 * t)),
      // Touch devices already have momentum from the OS; doubling it feels slippery.
      smoothWheel: true,
      syncTouch: false,
    });

    lenis.on('scroll', ScrollTrigger.update);

    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
    };
  }, []);

  return null;
}
