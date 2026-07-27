'use client';

import { flexRender, type Table as ReactTable } from '@tanstack/react-table';
import {
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from '@ayman/ui';
import { copy } from '@ayman/contracts';

/** `aria-sort`'s three legal values — never a boolean, never omitted. */
function ariaSort(sorted: false | 'asc' | 'desc'): 'ascending' | 'descending' | 'none' {
  if (sorted === 'asc') return 'ascending';
  if (sorted === 'desc') return 'descending';
  return 'none';
}

const SKELETON_ROW_WIDTHS = ['full', 'wide', 'narrow', 'wide', 'full'] as const;

export interface DataTableProps<TData> {
  table: ReactTable<TData>;
  /** Column count for the loading/empty full-width cell — not derived from
   *  `table` because during loading `data` may be `[]` and headers absent. */
  columnCount: number;
  loading?: boolean;
}

/**
 * A presentational shell over `table.getHeaderGroups()` /
 * `table.getRowModel()` — every list screen in the plan renders through this
 * one component so sort affordance, empty state and loading geometry never
 * drift between the students list and the attempts list.
 */
export function DataTable<TData>({ table, columnCount, loading = false }: DataTableProps<TData>) {
  const rows = table.getRowModel().rows;

  return (
    <TableWrapper>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead key={header.id} aria-sort={canSort ? ariaSort(sorted) : undefined}>
                    {header.isPlaceholder ? null : canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="flex items-center gap-4 text-start"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {loading ? (
            SKELETON_ROW_WIDTHS.map((width, index) => (
              <TableRow key={`skeleton-${index}`}>
                <TableCell colSpan={columnCount}>
                  <Skeleton width={width} />
                </TableCell>
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnCount} className="py-24 text-center text-fg-muted">
                {copy.common.empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id} data-selected={row.getIsSelected()}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableWrapper>
  );
}
