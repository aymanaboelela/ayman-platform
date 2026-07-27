'use client';

import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
  type Table,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';

/**
 * A3: column names cannot be parameterised in SQL, so a sort parameter that
 * reaches the query as a string is an injection vector even through an ORM.
 * Every sortable column resolves through a hardcoded map; anything unknown
 * falls back to the map's FIRST entry rather than throwing, because a stale
 * bookmark should render a list, not a 500.
 */
export function sortFromSearchParams<M extends Record<string, string>>(
  sort: string,
  dir: 'asc' | 'desc',
  allowed: M,
): SortingState {
  const key = Object.hasOwn(allowed, sort) ? sort : Object.keys(allowed)[0]!;
  return [{ id: key, desc: dir === 'desc' }];
}

export function toPrismaOrderBy<M extends Record<string, string>>(
  sort: string,
  dir: 'asc' | 'desc',
  allowed: M,
): Record<string, 'asc' | 'desc'> {
  const key = Object.hasOwn(allowed, sort) ? sort : Object.keys(allowed)[0]!;
  return { [allowed[key]!]: dir };
}

export interface UseDataTableOptions<TData extends { id: string }> {
  data: TData[];
  columns: Array<ColumnDef<TData, unknown>>;
  /** TOTAL rows matching the filter, from the server. Not `data.length`. */
  rowCount: number;
  pageIndex: number;
  pageSize: number;
  sorting: SortingState;
  onPaginationChange: (next: { pageIndex: number; pageSize: number }) => void;
  onSortingChange: (next: SortingState) => void;
}

/**
 * TanStack Table v8.21.3 in fully manual mode.
 *
 * v9 is still beta and a breaking rewrite, and Context7 serves v9 docs for
 * `/tanstack/table` by default — a generated snippet using `createTable` or
 * plugin-style row models is v9 and will not compile here.
 *
 * The four non-negotiables:
 *   - manualPagination / manualSorting / manualFiltering — the server does all
 *     three, so the table must not re-do them on the current page.
 *   - rowCount passed in — otherwise pageCount is -1 and pagination is dead.
 *   - getPaginationRowModel / getSortedRowModel / getFilteredRowModel OMITTED.
 *     getCoreRowModel is still REQUIRED — it is what builds rows at all.
 *   - getRowId: (row) => row.id — without it, selection keys are ARRAY INDICES,
 *     so selecting row 0 on page 2 and clicking a bulk action operates on the
 *     first row of page 1. It fails silently and only on page >= 2.
 */
export function useDataTable<TData extends { id: string }>(
  options: UseDataTableOptions<TData>,
): { table: Table<TData>; rowSelection: RowSelectionState; resetSelection: () => void } {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const pagination = useMemo(
    () => ({ pageIndex: options.pageIndex, pageSize: options.pageSize }),
    [options.pageIndex, options.pageSize],
  );

  const handlePagination: OnChangeFn<typeof pagination> = (updater) => {
    const next = typeof updater === 'function' ? updater(pagination) : updater;
    options.onPaginationChange(next);
  };

  const handleSorting: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === 'function' ? updater(options.sorting) : updater;
    options.onSortingChange(next);
  };

  const table = useReactTable<TData>({
    data: options.data,
    columns: options.columns,
    rowCount: options.rowCount,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    state: { pagination, sorting: options.sorting, rowSelection },
    onPaginationChange: handlePagination,
    onSortingChange: handleSorting,
    onRowSelectionChange: setRowSelection,
  });

  return { table, rowSelection, resetSelection: () => setRowSelection({}) };
}
