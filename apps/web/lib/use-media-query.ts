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
 * hovering cursor to drive a pointer-reactive effect.
 *
 * Both default to "yes, suppress" before hydration, so anything gated on this
 * is absent from the SSR'd HTML and appears only once the real answer is known.
 */
export function useAmbientEffectsAllowed(): boolean {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)', true);
  const coarse = useMediaQuery('(pointer: coarse)', true);
  return !reduced && !coarse;
}
