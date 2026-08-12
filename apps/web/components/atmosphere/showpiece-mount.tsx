'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useSyncExternalStore } from 'react';
import { useReducedMotion } from 'motion/react';
import { copy } from '@ayman/contracts/copy';
import * as tokens from '@ayman/ui/tokens';

/**
 * The import is declared at module scope but `next/dynamic` does not fetch the
 * chunk until the component is actually rendered — and with `ssr: false` Next
 * emits no preload link for it either. So a phone that never satisfies the gate
 * below never issues a request for the three.js chunk at all.
 */
const Showpiece = dynamic(() => import('./showpiece'), { ssr: false });

const DESKTOP_QUERY = '(min-width: 1024px)';

/**
 * `useSyncExternalStore`, not `useState` + `useEffect` + a manual `addEventListener`
 * dance: it is the primitive React ships specifically for reading an external,
 * mutable value that can change outside React (a media query is exactly that),
 * and it resolves the SSR/hydration split for free — `getServerSnapshot`
 * returns `false` so the server and first client paint agree, `getSnapshot`
 * takes over after. The alternative (calling `setState` synchronously inside
 * an effect body to capture the query's current value) is a documented
 * cascading-render anti-pattern.
 */
function subscribeDesktop(onChange: () => void): () => void {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
function getDesktopSnapshot(): boolean {
  return window.matchMedia(DESKTOP_QUERY).matches;
}
function getDesktopServerSnapshot(): boolean {
  return false;
}
function useDesktop(): boolean {
  return useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, getDesktopServerSnapshot);
}

/**
 * BELOW THE FOLD. Never render this above it.
 *
 * The poster is the server-rendered content and the fixed 640×480 box it
 * occupies is the same box the canvas takes, so the upgrade shifts nothing
 * (CLS contribution 0). Two independent gates must both pass before the chunk
 * is fetched: the user has not asked for reduced motion, and the viewport is a
 * desktop one.
 */
export function ShowpieceMount() {
  const reduced = useReducedMotion();
  const isDesktop = useDesktop();
  const live = reduced === false && isDesktop;

  return (
    // The poster was captured once against a fixed dark backdrop (the scene
    // reads as an engineering instrument, not decoration) and does not adapt
    // to the page theme the way the live, alpha-blended canvas does. The
    // panel background is therefore pinned to the same fixed dark tone
    // (`tokens.color.darkBase`, not the theme-following `--n-1`) so the poster
    // and the live canvas are visually identical in BOTH themes — a themed
    // panel would seam against the poster's baked-in dark corners in light
    // mode. This is the same "always-dark instrument screen" treatment a
    // video player's letterboxing gets, not a `--n-1` regression.
    <div
      aria-hidden="true"
      className="relative mx-auto aspect-[4/3] w-full max-w-[640px] overflow-hidden rounded-lg border border-line"
      style={{ backgroundColor: tokens.color.darkBase }}
    >
      {live ? (
        <Showpiece />
      ) : (
        <Image
          src="/showpiece-poster.webp"
          alt={copy.showpiece.posterAlt}
          width={640}
          height={480}
          sizes="(min-width: 1024px) 640px, 100vw"
          priority={false}
          className="h-full w-full object-contain"
        />
      )}
    </div>
  );
}
