'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Subscribes to a media query.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect` for two reasons,
 * both of which bite in practice:
 *
 * 1. **Hydration.** React uses `getServerSnapshot` for the render that hydrates
 *    and only then re-reads `getSnapshot`, so the first client render is
 *    guaranteed to match the server's HTML. Reading `matchMedia` inline in a
 *    component body looks equivalent and is not — `window` already exists while
 *    hydrating, so the client renders the real value over the server's guess and
 *    React throws away the tree.
 * 2. **No cascading render.** Setting state from inside an effect renders twice
 *    on every mount, which the React Compiler lint rule correctly rejects.
 *
 * `serverValue` is what the query reports before hydration. For queries that
 * gate an expensive effect, pass the value that means "off": the component then
 * renders nothing on the server and nothing during hydration, and switches on
 * afterwards — instead of rendering, unrendering, and shifting the layout.
 */
export function useMediaQuery(query: string, serverValue: boolean): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onStoreChange);
      return () => list.removeEventListener('change', onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  const getServerSnapshot = useCallback(() => serverValue, [serverValue]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * True when the visitor has asked for less motion, or is on a device with no
 * hovering cursor to drive a pointer-reactive effect, or on a viewport too
 * narrow for the effect to be worth its frame budget.
 *
 * All three default to "yes, suppress" before hydration, so anything gated on
 * this is absent from the SSR'd HTML and appears only once the real answer is
 * known.
 *
 * ## Why the width gate exists, when `pointer: coarse` already covers phones
 *
 * It does cover REAL phones — and it covered nothing in the lab. Lighthouse's
 * mobile emulation (and therefore PageSpeed Insights, and therefore the only
 * number anyone can see, since CrUX has no field data for this origin) sets
 * mobile device metrics and touch emulation but does NOT make
 * `(pointer: coarse)` match. So the gate opened, and the landing page mounted
 * SIX `ElectricBorder` canvases — three featured course cards, three year
 * tracks, each one an rAF loop doing `octavedNoise` arithmetic in JS around
 * several hundred perimeter points.
 *
 * Measured on the deployed site: `chunks/3bwrt62pwx67n.js` (the vendored
 * effect) alone accounted for 9,373 ms of the 9,910 ms of script evaluation —
 * 95% of it. Total blocking time 1,230 ms, time to interactive 12.7 s,
 * performance 63. Everything else on the page put together was noise beside it.
 *
 * `64rem` is the same breakpoint `footer-dragons.tsx` and `tracks-dragon.tsx`
 * already use to keep their ~1 MB webm pairs off phones, so this is the
 * established line in this codebase rather than a new one. A real phone still
 * fails `pointer: coarse` first; this catches the lab, the touch laptop, and
 * the half-width desktop window — none of which have the room for a
 * cursor-reactive effect anyway.
 */
export function useAmbientEffectsAllowed(): boolean {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)', true);
  const coarse = useMediaQuery('(pointer: coarse)', true);
  const wide = useMediaQuery('(min-width: 64rem)', false);
  return !reduced && !coarse && wide;
}
