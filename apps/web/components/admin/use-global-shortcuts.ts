'use client';

import { useEffect } from 'react';
import { matchesCombo, type Shortcut } from './shortcuts';

/**
 * The single `keydown` listener for the whole admin tree. Separated from
 * `CommandPalette` so the palette-toggle combo (`⌘K`) and the per-shortcut
 * combos share one registration point rather than each component adding its
 * own `window.addEventListener('keydown', ...)` — two listeners racing to
 * `preventDefault()` the same keystroke is exactly the kind of bug that only
 * shows up as "the shortcut sometimes doesn't fire."
 */
export function useGlobalShortcuts(entries: readonly Shortcut[], onTogglePalette: () => void, onRun: (shortcut: Shortcut) => void): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (matchesCombo(event, { mod: true, key: 'k' })) {
        event.preventDefault();
        onTogglePalette();
        return;
      }

      for (const shortcut of entries) {
        if (matchesCombo(event, shortcut.combo)) {
          event.preventDefault();
          onRun(shortcut);
          return;
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [entries, onTogglePalette, onRun]);
}
