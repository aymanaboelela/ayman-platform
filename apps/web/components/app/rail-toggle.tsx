'use client';

import { useSyncExternalStore } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
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
  const Icon = collapsed ? PanelRightOpen : PanelRightClose;

  return (
    <button
      type="button"
      onClick={() => setRail(collapsed ? 'expanded' : 'collapsed')}
      aria-label={collapsed ? copy.nav.expandRail : copy.nav.collapseRail}
      aria-expanded={!collapsed}
      className="flex size-9 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors duration-[160ms] ease-out hover:bg-surface-3 hover:text-fg"
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}
