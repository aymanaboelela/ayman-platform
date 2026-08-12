'use client';

import dynamic from 'next/dynamic';
import { useAmbientEffectsAllowed } from '@/lib/use-media-query';

/**
 * Momentum scrolling for the marketing surface, mounted once in the `(site)`
 * layout. The app, admin and quiz surfaces keep native scrolling — hijacking
 * the scroller under a graded attempt or a long admin table is a liability, not
 * a flourish.
 *
 * This file is only the gate. The Lenis instance and the GSAP wiring live in
 * `smooth-scroll-impl.tsx`, behind `ssr: false`, so the chunk is fetched only
 * once the gate has actually opened — the same shape `splash-cursor-mount.tsx`
 * already uses.
 *
 * Two gates, and the second is the one that was missing:
 *
 * - **Reduced motion.** Smoothed scrolling IS motion the user did not ask for,
 *   and a degraded emulation is worse than the native scroller.
 * - **Coarse pointers.** `syncTouch: false` in the impl has always meant touch
 *   gets *nothing* from Lenis — OS momentum is left alone — and yet the instance
 *   was still constructed on every phone that opened `/`, `/courses`,
 *   `/years/[year]`, `/essentials`, `/about` or a legal page, and it still bound
 *   its listeners. Lenis registers `wheel`, `touchstart`, `touchmove` and
 *   `touchend` on `window` with `{ passive: false }` (lenis 1.3.25,
 *   dist/lenis.mjs:255 and 283-286), which deliberately opts out of Chrome's
 *   passive-by-default intervention for touch listeners on `window`. Chrome then
 *   cannot hand the scroll to the compositor until the main thread has
 *   acknowledged that non-passive `touchstart`, and the handler does two array
 *   allocations and up to four `hasAttribute` probes per ancestor before it
 *   bails. On a mid-range Android with the main thread already busy, that
 *   acknowledgement is 100-300 ms away — the finger moves and the page does not.
 *   For zero benefit, since the touch path was delegated to the OS anyway.
 *
 * Nothing changes visually on touch: `lenis/dist/lenis.css` (the `html.lenis`
 * rules) is not imported anywhere in this app, so there are no CSS side effects
 * to lose either.
 *
 * `useAmbientEffectsAllowed` reports "not allowed" until hydration, by design
 * (see `lib/use-media-query.ts`). So on desktop the import now starts after
 * hydration rather than at first paint: a visitor who spins the wheel in the
 * very first moments gets native scrolling for a beat before momentum engages.
 * The effect already ran from `useEffect`, so that window is a little wider, not
 * a new one.
 *
 * ⚠️ Do not expect this to let the GSAP ticker sleep on `/`. `year-tracks.tsx`
 * leaves `repeat: -1` glyph tweens on the global timeline on wide viewports, and
 * `site-nav.tsx` keeps GSAP + ScrollTrigger loaded on every `(site)` route
 * regardless. What is recovered here is Lenis and its listeners, not the gsap
 * chunk.
 */
const SmoothScrollImpl = dynamic(() => import('./smooth-scroll-impl'), { ssr: false });

export function SmoothScroll() {
  const allowed = useAmbientEffectsAllowed();
  if (!allowed) return null;

  return <SmoothScrollImpl />;
}
