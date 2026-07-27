'use client';

import type { ReactNode } from 'react';
import type { Table } from '@tanstack/react-table';
import { copy, formatCopy } from '@ayman/contracts';

export interface DataTableBulkBarProps<TData> {
  table: Table<TData>;
  children: ReactNode;
}

/**
 * Fixed to the bottom of the viewport, spanning full width — `inset-x-0` is
 * symmetric (0 from both sides) so it carries no RTL/LTR direction of its
 * own. Renders only while at least one row is selected; the caller's action
 * handlers are expected to call `resetSelection()` (from `useDataTable`)
 * after a successful bulk action.
 */
export function DataTableBulkBar<TData>({ table, children }: DataTableBulkBarProps<TData>) {
  const count = table.getSelectedRowModel().rows.length;
  if (count === 0) return null;

  return (
    <div
      role="toolbar"
      className="fixed inset-x-0 bottom-[var(--s-24)] z-30 flex justify-center px-16"
    >
      <div className="flex items-center gap-16 rounded-[var(--r-lg)] border border-line bg-surface-2 px-16 py-12">
        <span className="text-[length:var(--fs-text-sm)] tabular-nums text-fg-muted">
          {formatCopy(copy.admin.list.selectedCount, { n: count })}
        </span>
        <div className="flex items-center gap-8">{children}</div>
      </div>
    </div>
  );
}
