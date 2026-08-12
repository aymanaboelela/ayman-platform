'use client';

import type { ReactNode } from 'react';
import { Input } from '@ayman/ui/components/input';
import { copy } from '@ayman/contracts/copy/admin';

export interface DataTableToolbarProps {
  /** The current free-text search value, read from the route's own nuqs state. */
  search: string;
  /**
   * Fires on every keystroke. The route's own `useQueryStates` setter is
   * expected to call with `shallow: false` and `throttleMs: 400` — this
   * component holds no nuqs state of its own, because every parser SHAPE is
   * per-route (students filter by governorate, attempts by quiz), and a
   * fully generic wrapper around `useQueryStates`'s keymap-typed API buys
   * nothing a route's own search-params module doesn't already have to do.
   *
   * The caller's setter must also reset `page` to 1 — filtering from page 7
   * down to three results otherwise renders an empty page 7 and looks like
   * data loss. That reset happens in the ROUTE's setter, not here.
   */
  onSearchChange: (value: string) => void;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  children?: ReactNode;
}

export function DataTableToolbar({
  search,
  onSearchChange,
  hasActiveFilters = false,
  onClearFilters,
  children,
}: DataTableToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 pb-4">
      <Input
        type="search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={copy.admin.list.searchPlaceholder}
        aria-label={copy.admin.list.searchPlaceholder}
        className="max-w-72"
      />
      {children}
      {hasActiveFilters ? (
        <button
          type="button"
          className="text-[length:var(--fs-text-sm)] text-accent-text underline"
          onClick={onClearFilters}
        >
          {copy.admin.list.clearFilters}
        </button>
      ) : null}
    </div>
  );
}
