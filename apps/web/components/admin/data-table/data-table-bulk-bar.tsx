'use client';

import type { ReactNode } from 'react';
import type { Table } from '@tanstack/react-table';
import { CheckSquare2 } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';

export interface DataTableBulkBarProps<TData> {
  table: Table<TData>;
  children: ReactNode;
}

/**
 * What to do with the rows that are ticked.
 *
 * ## Why it is at the TOP and not floating at the bottom
 *
 * It used to be `fixed bottom-24`, centred over the page. That is the pattern
 * a phone app uses, and on a 20-row admin table it puts the destructive button
 * as far from the checkboxes as the viewport allows: the operator ticks two
 * rows at the top of the list and then has to look at the opposite corner of
 * the screen to act on them. It also floated over the last rows of the table,
 * hiding the very data it was talking about.
 *
 * Here it sits where the selection is made, directly under the topbar, and
 * sticks there — so it is on screen whether the row was ticked at the top of
 * the page or after scrolling to the bottom. `top` is the shared
 * `--admin-header-h` token, which the header applies as its own height; the
 * two cannot drift apart.
 *
 * Renders only while at least one row is selected — an empty bar reserving
 * space above every table would be chrome that says nothing 95% of the time.
 * The caller's action handlers are expected to call `resetSelection()` (from
 * `useDataTable`) once the action has succeeded.
 */
export function DataTableBulkBar<TData>({ table, children }: DataTableBulkBarProps<TData>) {
  const count = table.getSelectedRowModel().rows.length;
  if (count === 0) return null;

  return (
    <div
      role="toolbar"
      aria-live="polite"
      className="sticky top-[var(--admin-header-h)] z-20 -mx-1 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-lg)] border border-accent/40 bg-[color-mix(in_oklch,var(--a-9),var(--n-2)_88%)] px-4 py-2.5"
    >
      <span className="flex items-center gap-2 text-[length:var(--fs-text-sm)] font-medium text-accent-text">
        <CheckSquare2 className="size-4 shrink-0" aria-hidden="true" />
        <span className="tabular-nums">{formatCopy(copy.admin.list.selectedCount, { n: count })}</span>
      </span>

      <div className="flex flex-wrap items-center gap-2">
        {children}
        {/* Always available, and never the same button as the action: the way
            out of a selection an operator made by accident must not be the
            control sitting next to «مسح». */}
        <button
          type="button"
          onClick={() => table.resetRowSelection()}
          className="rounded-[var(--r-sm)] px-2.5 py-1.5 text-[length:var(--fs-text-sm)] text-fg-muted transition-colors duration-[160ms] ease-out hover:bg-surface-3 hover:text-fg"
        >
          {copy.admin.list.clearSelection}
        </button>
      </div>
    </div>
  );
}
