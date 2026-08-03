'use client';

/**
 * The student shell's rail-collapse store.
 *
 * Deliberately the same shape as `lib/theme.ts`, for the same reason: the
 * value is persisted in `localStorage`, applied to `<html>` as an attribute
 * before first paint by `lib/security/prepaint-script.ts`, and read back here
 * only to drive a label and an icon. CSS owns the layout; this store owns
 * nothing the user can see move.
 *
 * That split is what keeps the rail flash-free. If the collapsed width came
 * from React state, the server — which cannot read `localStorage` — would
 * render the rail expanded on every load, and a student who had collapsed it
 * would watch 172px of layout snap away on hydration.
 *
 * The persisted contract is fixed by the pre-paint script: key `rail`, the
 * single value `collapsed`, absent meaning expanded. Absent-is-expanded (as
 * opposed to storing `'expanded'`) means a student who has never touched the
 * control writes nothing at all.
 */

export type RailState = 'expanded' | 'collapsed';

const STORAGE_KEY = 'rail';
const ATTRIBUTE = 'data-rail';

/** Registered by useSyncExternalStore; notified after every write. */
const listeners = new Set<() => void>();

/**
 * Used only when `localStorage` itself throws — Safari private browsing,
 * storage partitioning and some Firefox privacy settings make `getItem` and
 * `setItem` throw rather than degrade. Keeps the toggle usable for the session
 * even though nothing can persist.
 */
let memoryState: RailState = 'expanded';

export function applyRail(state: RailState): void {
  const root = document.documentElement;
  if (state === 'collapsed') root.setAttribute(ATTRIBUTE, 'collapsed');
  else root.removeAttribute(ATTRIBUTE);
}

export function readStoredRail(): RailState {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'collapsed' ? 'collapsed' : 'expanded';
  } catch {
    return memoryState;
  }
}

/**
 * SSR/hydration snapshot. Always 'expanded', because `localStorage` does not
 * exist on the server — and because it matches what the client renders before
 * its first post-hydration read, so there is no hydration mismatch. The
 * pre-paint script has already set the attribute by then; this value only
 * drives the toggle's label and chevron direction.
 */
export function getServerRail(): RailState {
  return 'expanded';
}

/** Also listens for cross-tab `storage` events, so a change in another tab lands here. */
export function subscribeRail(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

export function setRail(state: RailState): void {
  applyRail(state);
  // Recorded before the write is attempted, so `readStoredRail`'s catch branch
  // still reflects what was just applied to the DOM even if the write throws.
  memoryState = state;
  try {
    if (state === 'collapsed') localStorage.setItem(STORAGE_KEY, 'collapsed');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable; the choice is session-only until it works again
  } finally {
    for (const listener of listeners) listener();
  }
}
