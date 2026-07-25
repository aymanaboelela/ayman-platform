'use client';

import { useSyncExternalStore } from 'react';
import { copy } from '@ayman/contracts';

type Theme = 'light' | 'dark' | 'system';

const ORDER: readonly Theme[] = ['system', 'light', 'dark'] as const;
const STORAGE_KEY = 'theme';

/** Listeners registered by useSyncExternalStore, notified after `cycle` writes. */
const listeners = new Set<() => void>();

/**
 * Fallback used only when `localStorage` itself throws (Safari private
 * browsing, storage partitioning, some Firefox privacy settings all make
 * `getItem`/`setItem` throw rather than degrade). Keeps the toggle usable for
 * the session even though nothing can persist across reloads. Starts at
 * 'system' to match `getServerTheme` — the same default a healthy read would
 * produce on first mount.
 */
let memoryTheme: Theme = 'system';

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    // storage unavailable; fall back to the last theme cycle() recorded in memory
    return memoryTheme;
  }
}

/** SSR/hydration snapshot: always 'system', since localStorage does not exist
 * on the server. This matches what the client renders before its first
 * (post-hydration) read, so there is no hydration-mismatch warning. */
function getServerTheme(): Theme {
  return 'system';
}

/** Also listens for cross-tab `storage` events so a theme change in another
 * tab is reflected here without a manual effect. */
function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

function persistTheme(theme: Theme) {
  // Recorded unconditionally, before the write is attempted, so readStoredTheme's
  // catch branch always reflects the theme cycle() just applied to the DOM —
  // even if the write below throws.
  memoryTheme = theme;
  try {
    if (theme === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // storage unavailable; theme is session-only until storage works again
  } finally {
    for (const listener of listeners) listener();
  }
}

export function ThemeToggle() {
  // The inline script in the layout has already applied the persisted theme to
  // <html> before first paint, so there is no flash. useSyncExternalStore reads
  // localStorage via getSnapshot instead of calling setState from inside an
  // effect body — this only syncs the label text, it never itself touches the
  // `data-theme` attribute the inline script already set.
  const theme = useSyncExternalStore(subscribe, readStoredTheme, getServerTheme);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;
    apply(next);
    persistTheme(next);
  }

  const label =
    theme === 'light' ? copy.theme.light : theme === 'dark' ? copy.theme.dark : copy.theme.system;

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={copy.theme.toggle}
      className="mono inline-flex h-9 items-center gap-2 rounded-sm border border-line px-3 text-[length:var(--fs-mono-label)] text-fg-muted transition-colors duration-[var(--d-hover)] ease-[var(--ease)] hover:bg-surface-3 hover:text-fg"
    >
      <span aria-hidden="true">◑</span>
      <span>{label}</span>
    </button>
  );
}
