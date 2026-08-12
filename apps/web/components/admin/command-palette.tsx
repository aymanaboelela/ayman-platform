'use client';

import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { useCallback, useSyncExternalStore } from 'react';
import { copy } from '@ayman/contracts/copy/admin';
import { Kbd } from '@ayman/ui/components/kbd';
import { formatCombo, visibleShortcuts, type Shortcut } from './shortcuts';
import { useGlobalShortcuts } from './use-global-shortcuts';

/** Never changes after mount, so there is nothing to subscribe to — this
 *  external store exists purely to get a browser-only read (`navigator`)
 *  through React's hydration-safe path instead of a `useEffect` + `setState`
 *  (React Compiler's `set-state-in-effect` rule rejects the latter, and for
 *  good reason: it is exactly the "commit, then immediately re-render"
 *  pattern that produces a visible flash of the wrong platform's glyph). */
function subscribeNever(): () => void {
  return () => {};
}

function getPlatformSnapshot(): 'mac' | 'other' {
  return /mac|iphone|ipad/i.test(navigator.userAgent) ? 'mac' : 'other';
}

function getServerPlatformSnapshot(): 'mac' | 'other' {
  // The server has no navigator; every visitor sees "Ctrl" in markup that
  // could ever be prerendered, and the real value takes over the instant
  // this client component hydrates — no flash, no mismatch warning.
  return 'other';
}

/**
 * Every entry renders its own shortcut, so the palette teaches the shortcuts
 * rather than duplicating them (Linear's pattern). `dir="rtl"` on the
 * dialog: cmdk renders into a portal, which escapes the `<html dir="rtl">`
 * inheritance the rest of the page gets for free.
 */
export interface CommandPaletteProps {
  permissions: readonly string[];
  /** Controlled so the header's own `⌘K` button (a plain static hint until
   *  this task) and the global shortcut both drive the SAME open state. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ permissions, open, onOpenChange: setOpen }: CommandPaletteProps) {
  const platform = useSyncExternalStore(subscribeNever, getPlatformSnapshot, getServerPlatformSnapshot);
  const router = useRouter();
  const entries = visibleShortcuts(permissions);

  const run = useCallback(
    (shortcut: Shortcut) => {
      setOpen(false);
      if (shortcut.href) router.push(shortcut.href);
      else window.dispatchEvent(new CustomEvent('ayman:action', { detail: shortcut.id }));
    },
    [router, setOpen],
  );

  const togglePalette = useCallback(() => setOpen(!open), [open, setOpen]);

  useGlobalShortcuts(entries, togglePalette, run);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      dir="rtl"
      label={copy.admin.shortcuts.paletteLabel}
      className="fixed start-0 end-0 top-24 z-50 mx-auto max-w-xl rounded-[var(--r-lg)] border border-line bg-surface-2"
    >
      <Command.Input
        placeholder={copy.admin.shortcuts.placeholder}
        className="w-full border-b border-line bg-transparent px-4 py-3 text-start outline-none"
      />
      <Command.List className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="p-4 text-fg-muted">{copy.common.empty}</Command.Empty>

        {(['navigate', 'act'] as const).map((group) => (
          <Command.Group key={group} heading={copy.admin.shortcuts[group]}>
            {entries
              .filter((shortcut) => shortcut.group === group)
              .map((shortcut) => (
                <Command.Item
                  key={shortcut.id}
                  value={shortcut.labelAr}
                  onSelect={() => run(shortcut)}
                  className="flex items-center justify-between gap-2 rounded-[var(--r-sm)] px-3 py-2 data-[selected=true]:bg-surface-4"
                >
                  <span>{shortcut.labelAr}</span>
                  <span className="flex gap-0.5">
                    {formatCombo(shortcut.combo, platform).map((part, index) => (
                      <Kbd key={index}>{part}</Kbd>
                    ))}
                  </span>
                </Command.Item>
              ))}
          </Command.Group>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}
