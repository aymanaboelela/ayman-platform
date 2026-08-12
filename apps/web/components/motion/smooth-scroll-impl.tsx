'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';
import { gsap, ScrollTrigger } from '@/lib/gsap';

/**
 * The actual Lenis instance. Split out of `smooth-scroll.tsx` so that
 * `import Lenis from 'lenis'` sits behind a `next/dynamic({ ssr: false })`
 * boundary and the chunk is never even requested on the devices that are gated
 * out — see the wrapper for who those are and why.
 *
 * ⚠️ `gsap` and `ScrollTrigger` come from `@/lib/gsap`, never from the package.
 * That module is the single `registerPlugin` site and its header explains the
 * failure mode: a direct `gsap/ScrollTrigger` import pulls a second copy into
 * this chunk with its own trigger registry, and half the triggers on the page
 * quietly stop refreshing on resize. This file is a lazily-loaded chunk, which
 * is exactly the situation where that split is easiest to cause and hardest to
 * spot.
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
 */
export default function SmoothScrollImpl() {
  useEffect(() => {
    // The wrapper has already answered this question — this is the second lock
    // on the same door, for anyone who later imports this module directly. It
    // costs one `matchMedia` read on mount, and it means the expensive thing can
    // never be constructed by an import that forgot the gate.
    if (window.matchMedia('(prefers-reduced-motion: reduce), (pointer: coarse)').matches) {
      return;
    }

    const lenis = new Lenis({
      // A longer glide with a gentler tail. At 1.05 the scroll still had a
      // perceptible "stop"; stretching it lets the page coast, which is what
      // makes the scrubbed animations riding on it (the rail, the dragon's
      // flight) read as motion with mass rather than as values wired to the
      // scrollbar.
      duration: 1.35,
      // Exponential-out: fast pickup, long settle, no overshoot.
      easing: (t) => Math.min(1, 1.001 - 2 ** (-11 * t)),
      // A little under 1:1, so a full wheel notch travels slightly less and the
      // page feels weighty instead of skittish.
      wheelMultiplier: 0.9,
      // Touch devices already have momentum from the OS; doubling it is
      // slippery and fights the platform. Kept even though the gate above means
      // this branch is now unreachable on touch: it is the setting that made the
      // gate obviously correct in the first place — if touch gets nothing from
      // Lenis, touch should not be paying for Lenis.
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
