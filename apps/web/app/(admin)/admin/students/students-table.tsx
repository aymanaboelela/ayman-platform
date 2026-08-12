'use client';

import { useQueryStates } from 'nuqs';
import type { AdminStudentRow, StudentListQuery } from '@ayman/contracts/admin/students';
import { copy } from '@ayman/contracts/copy/admin';
import { useDataTable } from '@/components/admin/data-table/use-data-table';
import { DataTable } from '@/components/admin/data-table/data-table';
import { DataTablePagination } from '@/components/admin/data-table/data-table-pagination';
import { DataTableToolbar } from '@/components/admin/data-table/data-table-toolbar';
import { FacetedFilter, type FacetedFilterOption } from '@/components/admin/data-table/faceted-filter';
import { studentColumns } from './columns';
import { studentsSearchParams } from './search-params';

export interface StudentsTableProps {
  rows: AdminStudentRow[];
  rowCount: number;
  query: StudentListQuery;
  governorateOptions: FacetedFilterOption[];
  trackOptions: FacetedFilterOption[];
  yearOptions: FacetedFilterOption[];
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

  return (
    <>
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
