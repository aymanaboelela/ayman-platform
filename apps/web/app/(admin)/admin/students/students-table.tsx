'use client';

import { useQueryStates } from 'nuqs';
import type { AdminStudentRow, StudentListQuery } from '@ayman/contracts/admin/students';
import { copy } from '@ayman/contracts/copy/admin';
import { useDataTable } from '@/components/admin/data-table/use-data-table';
import { DataTable } from '@/components/admin/data-table/data-table';
import { DataTableBulkBar } from '@/components/admin/data-table/data-table-bulk-bar';
import { DataTablePagination } from '@/components/admin/data-table/data-table-pagination';
import { DataTableToolbar } from '@/components/admin/data-table/data-table-toolbar';
import { FacetedFilter, type FacetedFilterOption } from '@/components/admin/data-table/faceted-filter';
import { BulkDeleteDialog } from './bulk-delete-dialog';
import { studentColumns } from './columns';
import { studentsSearchParams } from './search-params';

export interface StudentsTableProps {
  rows: AdminStudentRow[];
  rowCount: number;
  query: StudentListQuery;
  governorateOptions: FacetedFilterOption[];
  trackOptions: FacetedFilterOption[];
  yearOptions: FacetedFilterOption[];
  /**
   * Whether the session holds `student:delete`. The API re-checks on every
   * call — this only decides whether the bar offers the button at all, so a
   * moderator does not tick eight rows to be told no at the end.
   */
  canDelete: boolean;
}

/**
 * The client half of the students screen. `useQueryStates` reads the SAME
 * parser map the server-side cache parsed `query` from — server and client
 * agree on shape by construction, not by convention.
 */
export function StudentsTable({
  rows,
  rowCount,
  query,
  governorateOptions,
  trackOptions,
  yearOptions,
  canDelete,
}: StudentsTableProps) {
  const [state, setState] = useQueryStates(studentsSearchParams);

  const { table } = useDataTable({
    data: rows,
    columns: studentColumns,
    rowCount,
    pageIndex: query.page - 1,
    pageSize: query.perPage,
    sorting: [{ id: query.sort, desc: query.dir === 'desc' }],
    onPaginationChange: (next) =>
      void setState({ page: next.pageIndex + 1, perPage: next.pageSize }),
    onSortingChange: (next) => {
      const first = next[0];
      if (!first) return;
      void setState({ sort: first.id as StudentListQuery['sort'], dir: first.desc ? 'desc' : 'asc', page: 1 });
    },
  });

  const hasActiveFilters = state.governorate.length > 0 || state.year.length > 0 || state.track.length > 0;

  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);

  return (
    <>
      {/*
        ABOVE the toolbar, so the bar appears between the topbar and the search
        field — where the checkboxes are — rather than floating over the last
        rows of the table. `DataTableBulkBar` renders nothing while the
        selection is empty, so nothing moves until something is ticked.
      */}
      <DataTableBulkBar table={table}>
        {canDelete ? (
          <BulkDeleteDialog
            rows={selectedRows}
            onDone={(keepSelected) => {
              /*
               * Refused rows STAY ticked; everything else is cleared. Wiping
               * the whole selection would hide the one row that did not go —
               * the operator would have to notice a count changed by one and
               * then find it again by hand.
               *
               * Set in ONE call rather than a reset followed by a loop of
               * `toggleSelected`: the keys here are row ids only because
               * `useDataTable` sets `getRowId`, and one assignment cannot land
               * half-applied the way a sequence of updater calls can.
               */
              table.setRowSelection(Object.fromEntries(keepSelected.map((id) => [id, true])));
            }}
          />
        ) : null}
      </DataTableBulkBar>

      <DataTableToolbar
        search={state.q}
        onSearchChange={(value) => void setState({ q: value, page: 1 })}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={() => void setState({ governorate: [], year: [], track: [], page: 1 })}
      >
        <FacetedFilter
          title={copy.admin.students.filterGovernorate}
          options={governorateOptions}
          selected={state.governorate}
          onChange={(next) => void setState({ governorate: next, page: 1 })}
        />
        <FacetedFilter
          title={copy.admin.students.filterYear}
          options={yearOptions}
          selected={state.year.map(String)}
          onChange={(next) => void setState({ year: next.map(Number), page: 1 })}
        />
        <FacetedFilter
          title={copy.admin.students.filterTrack}
          options={trackOptions}
          selected={state.track}
          onChange={(next) => void setState({ track: next, page: 1 })}
        />
      </DataTableToolbar>
      <DataTable table={table} columnCount={studentColumns.length} />
      <DataTablePagination table={table} />
    </>
  );
}
