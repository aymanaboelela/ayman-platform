'use client';

import { useSyncExternalStore } from 'react';
import { copy } from '@ayman/contracts';
import {
  getServerTheme,
  readStoredTheme,
  setTheme,
  subscribeTheme,
  type Theme,
} from '@/lib/theme';

const ORDER: readonly Theme[] = ['system', 'light', 'dark'] as const;

/**
 * The app surface's theme control: a three-position cycle that keeps 'system'
 * reachable as an explicit choice.
 *
 * The marketing surface uses a two-position pill instead
 * (`components/site/theme-pill.tsx`); both drive the same store in `lib/theme`,
 * so a change in one is reflected in the other without a reload.
 */
export function ThemeToggle() {
  // The inline script in the layout has already applied the persisted theme to
  // <html> before first paint, so there is no flash. useSyncExternalStore reads
  // localStorage via getSnapshot instead of calling setState from inside an
  // effect body — this only syncs the label text, it never itself touches the
  // `data-theme` attribute the inline script already set.
  const theme = useSyncExternalStore(subscribeTheme, readStoredTheme, getServerTheme);

  const label =
    theme === 'light' ? copy.theme.light : theme === 'dark' ? copy.theme.dark : copy.theme.system;

  return (
    <button
      type="button"
      onClick={() => setTheme(ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!)}
      aria-label={copy.theme.toggle}
      className="mono inline-flex h-9 items-center gap-2 rounded-sm border border-line px-3 text-[length:var(--fs-mono-label)] text-fg-muted transition-colors duration-[var(--d-hover)] ease-[var(--ease)] hover:bg-surface-3 hover:text-fg"
    >
      <span aria-hidden="true">◑</span>
      <span>{label}</span>
    </button>
  );
}
