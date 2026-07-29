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
 * The marketing surface's theme control: a two-position sun/moon pill.
 *
 * It deliberately does not expose 'system' as a third stop — a marketing page
 * gets one obvious affordance, not a tri-state. 'system' is still the default
 * and stays in effect until the pill is touched; after that the choice is
 * explicit, which is what a user clicking a sun icon means.
 *
 * The store resolves 'system' against the media query, so an untouched pill on
 * a dark-preferring machine renders with the moon selected rather than falsely
 * showing light — and it stays correct if the OS flips appearance while the
 * page is open. The media query is read inside the store, never in this body;
 * see `readResolvedTheme` for why that distinction is load-bearing.
 */
export function ThemePill() {
  const mode = useSyncExternalStore(
    subscribeResolvedTheme,
    readResolvedTheme,
    getServerResolvedTheme,
  );

  return (
    <button
      type="button"
      className="theme-pill"
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
