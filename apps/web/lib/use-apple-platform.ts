'use client';

import { useSyncExternalStore } from 'react';
import { isApplePlatform } from './platform';

/** The value never changes after mount, so there is nothing to subscribe to
 * — this no-op unsubscribe is `useSyncExternalStore`'s required shape, not a
 * real subscription. Mirrors `components/theme-toggle.tsx`'s use of the same
 * hook for the same class of problem (a value that legitimately differs
 * between the server snapshot and the real client value). */
function subscribe() {
  return () => {};
}

function getSnapshot(): boolean {
  return isApplePlatform(navigator.userAgent);
}

/** SSR/hydration snapshot: always `false`. There is no `navigator` on the
 * server, and — per the brief — an Apple platform must never be assumed;
 * "unknown" resolves to hidden, never shown. `useSyncExternalStore` is what
 * makes this safe: React explicitly permits the server snapshot and the
 * first client snapshot to differ here without a hydration-mismatch
 * warning, because it defers reading `getSnapshot` until after hydration
 * commits — unlike a plain `useState(false)` + `useEffect`, which would
 * still work but pays an extra render. */
function getServerSnapshot(): boolean {
  return false;
}

/** Whether the "Sign in with Apple" button should render. Google always
 * renders regardless of this hook's value. */
export function useShouldShowAppleButton(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
