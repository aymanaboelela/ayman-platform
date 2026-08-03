'use client';

import { useSyncExternalStore } from 'react';
import { ChevronsLeft } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { getServerRail, readStoredRail, setRail, subscribeRail } from '@/lib/rail';

/**
 * Collapses and expands the rail.
 *
 * It writes `localStorage` and an attribute on `<html>`; it does NOT drive the
 * layout, which is pure CSS keyed on that attribute (see `globals.css`). All
 * this subscription buys is a correct `aria-label` and a chevron pointing the
 * right way — so a failed read degrades to a mislabelled button, never to a
 * broken shell.
 *
 * `useSyncExternalStore` rather than an effect, exactly as `ThemeToggle` does:
 * React uses `getServerSnapshot` for the hydrating render and only then
 * re-reads `getSnapshot`, so the first client render stays byte-identical to
 * the server's. Reading `localStorage` inline in the component body looks
 * equivalent and is not — `typeof window` is already defined while hydrating,
 * so a student with a collapsed rail would render 'collapsed' over the
 * server's 'expanded' and React would discard the tree with a hydration error.
 *
 * Hidden on the lesson player: the rail is forced collapsed there by the
 * route, and a control that appears to do nothing is worse than no control.
 */
export function RailToggle({ hidden }: { hidden: boolean }) {
  const state = useSyncExternalStore(subscribeRail, readStoredRail, getServerRail);

  if (hidden) return null;

  const collapsed = state === 'collapsed';

  return (
    <button
      type="button"
      onClick={() => setRail(collapsed ? 'expanded' : 'collapsed')}
      aria-label={collapsed ? copy.nav.expandRail : copy.nav.collapseRail}
      aria-expanded={!collapsed}
      title={collapsed ? copy.nav.expandRail : copy.nav.collapseRail}
      className="flex size-9 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors duration-[160ms] ease-out hover:bg-surface-3 hover:text-fg"
    >
      {/*
        One chevron pair that points at the edge it is about to move.

        The previous icons were lucide's `PanelRightOpen` / `PanelRightClose`.
        Those draw a literal left-hand panel with the divider on the right, and
        lucide does not mirror its glyphs for RTL — so in this document, where
        the rail sits on the RIGHT, the button showed a panel on the wrong side
        pointing the wrong way, in both states. It looked like a control for a
        different layout, which is what makes it read as broken.

        `.icon-inline` is the codebase's own answer to this: it flips on
        `--dir-x`, set by the document's `dir`. The chevrons therefore point
        toward the inline start (the rail's own edge) when they will collapse
        it, and toward the inline end (the content) when they will bring it
        back — correct in RTL today and correct unchanged if an English locale
        ever ships.
      */}
      <ChevronsLeft
        className={collapsed ? 'icon-inline size-4 rotate-180' : 'icon-inline size-4'}
        aria-hidden="true"
      />
    </button>
  );
}
