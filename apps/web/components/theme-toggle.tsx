'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { getServerTheme, readStoredTheme, setTheme, subscribeTheme } from '@/lib/theme';

/**
 * The theme control — one component, every surface.
 *
 * It used to be two. The marketing nav had a two-position sun/moon pill; the
 * signed-in topbar had a button that cycled system → light → dark and printed
 * the current mode in Arabic beside a `◑` glyph. Same setting, two shapes, two
 * interaction models, visible within one session — exactly the kind of seam
 * that makes a product feel assembled rather than designed. The pill is what
 * survived: the knob IS the state, so nothing has to be spelled out, and it is
 * the shape a phone user already knows.
 *
 * ## The pill has exactly two positions, and LIGHT is where it starts
 *
 * There is no 'system' stop and no longer a hidden third state behind the two:
 * an untouched pill renders with the sun lit on every machine, whatever the OS
 * is set to, and only pressing it writes anything. See `lib/theme.ts` for why
 * the platform stopped following `prefers-color-scheme`.
 *
 * ## Why `useSyncExternalStore`
 *
 * The inline script in the root layout has already applied the persisted theme
 * to `<html>` before first paint, so there is no flash; this only decides which
 * half is lit. React uses `getServerSnapshot` for the hydrating render and
 * re-reads `getSnapshot` only afterwards, which keeps the first client render
 * byte-identical to the server's — `localStorage` is readable while hydrating,
 * so reading it inline in this body would render `dark` over the server's
 * `light` for anyone who has chosen dark, and React would discard the tree.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const mode = useSyncExternalStore(subscribeTheme, readStoredTheme, getServerTheme);

  return (
    <button
      type="button"
      className={className ? `theme-pill ${className}` : 'theme-pill'}
      data-mode={mode}
      aria-label={copy.theme.toggle}
      aria-pressed={mode === 'dark'}
      onClick={() => setTheme(mode === 'dark' ? 'light' : 'dark')}
    >
      <span className="theme-pill__knob" aria-hidden="true" />
      <span className="theme-pill__icon theme-pill__icon--sun" aria-hidden="true">
        <Sun size={14} strokeWidth={2.4} />
      </span>
      <span className="theme-pill__icon theme-pill__icon--moon" aria-hidden="true">
        <Moon size={14} strokeWidth={2.4} />
      </span>
    </button>
  );
}
