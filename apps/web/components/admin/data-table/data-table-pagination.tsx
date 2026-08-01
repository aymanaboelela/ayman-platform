'use client';

import type { Table } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Select } from '@ayman/ui';
import { copy } from '@ayman/contracts';
import { PAGE_SIZES } from '@ayman/contracts/admin/list';

const BUTTON_CLASS =
  'flex size-8 items-center justify-center rounded-[var(--r-sm)] text-fg-muted ' +
  'hover:bg-surface-3 hover:text-fg disabled:pointer-events-none disabled:opacity-40';

/**
 * `صفحة X من Y`, tabular-nums throughout. In RTL, content flows right to
 * left, so "next" points the reading direction FORWARD, which is LEFT —
 * hence `ChevronLeft` for next/last and `ChevronRight` for previous/first.
 * This is the single most commonly wrong detail in an RTL pagination bar.
 */
export function DataTablePagination<TData>({ table }: { table: Table<TData> }) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = Math.max(table.getPageCount(), 1);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 pt-4 tabular-nums">
      <div className="flex items-center gap-2 text-[length:var(--fs-text-sm)] text-fg-muted">
        <span>{copy.admin.list.perPage}</span>
        <Select
          value={pageSize}
          onChange={(event) => table.setPageSize(Number(event.target.value))}
          className="w-auto"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </Select>
      </div>

      <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
        {copy.admin.list.page} {pageIndex + 1} {copy.admin.list.of} {pageCount}
      </p>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label={copy.admin.list.first}
          onClick={() => table.setPageIndex(0)}
          disabled={!table.getCanPreviousPage()}
          className={BUTTON_CLASS}
        >
          <ChevronsRight className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={copy.admin.list.previous}
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          className={BUTTON_CLASS}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={copy.admin.list.next}
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          className={BUTTON_CLASS}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={copy.admin.list.last}
          onClick={() => table.setPageIndex(pageCount - 1)}
          disabled={!table.getCanNextPage()}
          className={BUTTON_CLASS}
        >
          <ChevronsLeft className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
