'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
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
 * - The instance is HANDED OUT through a ref so the route-change effect below
 *   can reach it. See that effect for what happens without it.
 */
export default function SmoothScrollImpl() {
  const lenisRef = useRef<Lenis | null>(null);
  const pathname = usePathname();

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

    lenisRef.current = lenis;
    lenis.on('scroll', ScrollTrigger.update);

    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      lenisRef.current = null;
      lenis.destroy();
    };
  }, []);

  /*
   * ⚠️ HAND THE SCROLLER OVER ON EVERY NAVIGATION, or the next page opens at
   * its own bottom.
   *
   * Lenis does not read `scrollTop`; it OWNS a position (`animatedScroll` /
   * `targetScroll`) and writes it to the document every frame while its inertia
   * animation is running. A client-side route change does not touch either
   * number — nothing tells Lenis the document underneath it was replaced — so
   * the glide that was still coasting when the link was clicked carries the
   * OLD page's offset onto the new one and wins, because it writes last.
   *
   * Measured on production, landing page → `/courses/[slug]`, wheel-driven so
   * the inertia was genuinely in flight:
   *
   *   html.scrollTop = 0                          ← Next scrolls the new page to the top
   *   window.scrollTo({top: 6480, behavior:…})    ← Lenis, still holding the landing page
   *   window.scrollTo({top: 6480, behavior:…})      position, overwrites it, repeatedly
   *   …
   *
   * The course page is 2716px tall, so 6480 clamps to its maximum scroll and
   * the reader arrives at the footer of a page they have never seen the top of.
   * It looked intermittent and was not: driving the same scroll with
   * `window.scrollTo` instead of the wheel made it go away, because that fires
   * a native scroll event which Lenis resyncs from — so it only ever bit the
   * readers who arrived the normal way.
   *
   * `stop()` is the fix and the whole of it: it calls Lenis's own `reset()`,
   * which halts the in-flight animation AND re-points both position values at
   * the document's real `scrollTop`. Nothing is written after that until the
   * reader touches the wheel again, which is what lets Next's scroll-to-top —
   * or a restored offset on a back/forward — stand.
   *
   * Held stopped for one frame rather than restarted inline so the order of
   * this effect against Next's own scroll handling cannot matter. Stopped is a
   * safe state to be in for a frame: `onVirtualScroll` bails while stopped
   * without calling `preventDefault`, so the page still scrolls natively.
   *
   * `resize()` before `start()` because `limit` is measured, not derived, and
   * the new route is a different height — a stale limit lets the first wheel
   * notch overscroll past the real end of the page.
   *
   * Keyed on the PATHNAME alone. A search-param change is the same document
   * (`years/[year]` pages its filters that way, with `scroll={false}`, and
   * would be yanked to the top on every tap), and a hash change is a jump the
   * reader asked for.
   */
  useEffect(() => {
    const lenis = lenisRef.current;
    if (!lenis) return;

    lenis.stop();
    const frame = requestAnimationFrame(() => {
      lenis.resize();
      lenis.start();
    });

    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
