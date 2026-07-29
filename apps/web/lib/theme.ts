'use client';

/**
 * The theme store shared by every control that can change the theme.
 *
 * Extracted from `components/theme-toggle.tsx` when the marketing surface added
 * a second control (a two-position sun/moon pill). Two components each owning
 * their own copy of "read localStorage, write the attribute, notify" is two
 * sources of truth: flip the theme in the nav and the app-surface toggle keeps
 * rendering the previous label until something else re-renders it.
 *
 * The persisted contract is fixed by `lib/security/theme-script.ts`, which runs
 * inline before first paint and is hashed into the CSP — key `theme`, values
 * `light` | `dark`, absent meaning "follow the system".
 */

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'theme';

/** Registered by useSyncExternalStore; notified after every write. */
const listeners = new Set<() => void>();

/**
 * Used only when `localStorage` itself throws — Safari private browsing,
 * storage partitioning and some Firefox privacy settings make `getItem` and
 * `setItem` throw rather than degrade. Keeps the control usable for the session
 * even though nothing can persist. Starts at 'system' to match
 * `getServerTheme`, i.e. what a healthy read produces on first mount.
 */
let memoryTheme: Theme = 'system';

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return memoryTheme;
  }
}

/**
 * SSR/hydration snapshot. Always 'system', because `localStorage` does not
 * exist on the server — and because this matches what the client renders before
 * its first post-hydration read, so there is no hydration mismatch. The inline
 * script has already set the attribute by then; this value only drives labels.
 */
export function getServerTheme(): Theme {
  return 'system';
}

/** Also listens for cross-tab `storage` events, so a change in another tab lands here. */
export function subscribeTheme(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

export function setTheme(theme: Theme): void {
  applyTheme(theme);
  // Recorded before the write is attempted, so `readStoredTheme`'s catch branch
  // still reflects what was just applied to the DOM even if the write throws.
  memoryTheme = theme;
  try {
    if (theme === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // storage unavailable; the choice is session-only until it works again
  } finally {
    for (const listener of listeners) listener();
  }
}

/**
 * What the page is actually showing right now, resolving 'system' against the
 * media query. The two-position pill needs this: with no stored preference it
 * must still render the correct half as selected.
 *
 * ⚠️ Must only ever be reached through `useSyncExternalStore`, never called
 * directly during render. React uses `getServerSnapshot` for the hydrating
 * render and only then re-reads `getSnapshot` — so routing the media query
 * through the store is what keeps the first client render byte-identical to
 * the server's. Reading `window.matchMedia` inline in a component body looks
 * equivalent and is not: `typeof window` is already defined while hydrating,
 * so a dark-preferring machine renders `dark` over the server's `light` and
 * React discards the tree with a hydration error.
 */
export function readResolvedTheme(): 'light' | 'dark' {
  const stored = readStoredTheme();
  if (stored !== 'system') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** The server has neither storage nor a media query; 'light' is the arbitrary
 *  but stable half, corrected on the first post-hydration read. */
export function getServerResolvedTheme(): 'light' | 'dark' {
  return 'light';
}

/**
 * Subscribes to BOTH inputs `readResolvedTheme` depends on. Subscribing only to
 * the theme store would leave the pill stale when the OS flips appearance while
 * the page is open and no explicit choice has been made.
 */
export function subscribeResolvedTheme(onStoreChange: () => void): () => void {
  const unsubscribe = subscribeTheme(onStoreChange);
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  query.addEventListener('change', onStoreChange);
  return () => {
    unsubscribe();
    query.removeEventListener('change', onStoreChange);
  };
}
