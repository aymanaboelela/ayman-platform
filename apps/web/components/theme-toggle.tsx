'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { copy } from '@ayman/contracts';
import {
  getServerResolvedTheme,
  readResolvedTheme,
  setTheme,
  subscribeResolvedTheme,
} from '@/lib/theme';

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
 * ## 'system' is still the default, and still honoured
 *
 * Dropping the explicit third stop does not pin anyone to a manual choice.
 * With nothing stored the store reports 'system', which this control resolves
 * against `prefers-color-scheme` — so an untouched pill on a dark-preferring
 * machine renders with the moon lit, and follows the OS if it flips while the
 * page is open. Only pressing it writes a preference.
 *
 * ## Why `useSyncExternalStore`
 *
 * The inline script in the root layout has already applied the persisted theme
 * to `<html>` before first paint, so there is no flash; this only decides which
 * half is lit. React uses `getServerSnapshot` for the hydrating render and
 * re-reads `getSnapshot` only afterwards, which keeps the first client render
 * byte-identical to the server's. Reading `matchMedia` inline in this body
 * looks equivalent and is not — `typeof window` is already defined while
 * hydrating, so a dark-preferring machine would render `dark` over the
 * server's `light` and React would discard the tree.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const mode = useSyncExternalStore(
    subscribeResolvedTheme,
    readResolvedTheme,
    getServerResolvedTheme,
  );

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
