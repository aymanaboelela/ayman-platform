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
 * The persisted contract is fixed by `lib/security/prepaint-script.ts`, which
 * runs inline before first paint and is hashed into the CSP — key `theme`,
 * values `light` | `dark`.
 *
 * ## ⚠️ LIGHT IS THE PLATFORM'S DEFAULT, and it does NOT follow the OS
 *
 * It used to: with nothing stored the store reported 'system' and every control
 * resolved that against `prefers-color-scheme`, so a student whose phone was in
 * dark mode met a dark platform without ever choosing one. That is no longer
 * what this product wants — «عاوز الديفولت بتاع المنصة كلها يبقى لايت مود».
 *
 * So there is no third state left. Nothing stored means LIGHT, exactly as if it
 * had been chosen, and `prefers-color-scheme` is consulted nowhere in this file.
 * The OS preference still reaches the stylesheets, but only through selectors
 * that an explicit `data-theme` outranks — and one is now always present, from
 * the server's own `<html>` and from the prepaint script alike.
 *
 * Dark remains one press away and is remembered forever once pressed.
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

/** Registered by useSyncExternalStore; notified after every write. */
const listeners = new Set<() => void>();

/**
 * Used only when `localStorage` itself throws — Safari private browsing,
 * storage partitioning and some Firefox privacy settings make `getItem` and
 * `setItem` throw rather than degrade. Keeps the control usable for the session
 * even though nothing can persist. Starts at 'light' to match `getServerTheme`,
 * i.e. what a healthy read produces on first mount.
 */
let memoryTheme: Theme = 'light';

export function applyTheme(theme: Theme): void {
  // ⚠️ ALWAYS an attribute, never a removal. Taking `data-theme` off hands the
  // page back to `prefers-color-scheme`, which is the behaviour this store
  // exists to prevent — see the header.
  document.documentElement.setAttribute('data-theme', theme);
}

export function readStoredTheme(): Theme {
  try {
    // Anything that is not exactly 'dark' — absent, corrupt, or the legacy
    // 'system' this store used to write — resolves to the default.
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return memoryTheme;
  }
}

/**
 * SSR/hydration snapshot. 'light' is the default and the value the server's own
 * `<html data-theme>` carries, so the first client render matches the markup
 * for everyone except a reader who has explicitly chosen dark — for whom the
 * prepaint script has already corrected the attribute before paint, and this
 * store corrects the label on its first post-hydration read.
 */
export function getServerTheme(): Theme {
  return 'light';
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
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // storage unavailable; the choice is session-only until it works again
  } finally {
    for (const listener of listeners) listener();
  }
}
