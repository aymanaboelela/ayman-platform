'use client';

import { useQueryStates } from 'nuqs';
import type { AdminAttemptRow, ATTEMPT_STATES } from '@ayman/contracts/admin/attempts';
import { copy } from '@ayman/contracts/copy/admin';
import { Select } from '@ayman/ui/components/select';
import { useDataTable } from '@/components/admin/data-table/use-data-table';
import { DataTable } from '@/components/admin/data-table/data-table';
import { DataTablePagination } from '@/components/admin/data-table/data-table-pagination';
import { DataTableToolbar } from '@/components/admin/data-table/data-table-toolbar';
import { attemptColumns } from './columns';
import { attemptsSearchParams } from './search-params';

const STATE_LABEL = {
  in_progress: copy.quizAdmin.stateInProgress,
  overdue: copy.quizAdmin.stateOverdue,
  submitted: copy.quizAdmin.stateSubmitted,
  pending_review: copy.quizAdmin.statePendingReview,
  abandoned: copy.quizAdmin.stateAbandoned,
} as const;

export interface AttemptsTableProps {
  rows: AdminAttemptRow[];
  /** Whether the server returned one MORE row than `perPage` — signals a next page exists. */
  hasMore: boolean;
  page: number;
  perPage: number;
}

/**
 * `AttemptAdminService.listAttempts` is `take`/`skip` with no total COUNT —
 * adding one would mean writing to a Plan 5 file this task is explicitly
 * scoped out of touching. `rowCount` is therefore an ESTIMATE: known-so-far
 * plus one more when `hasMore`, which makes "next" and "previous" behave
 * correctly without ever claiming an exact total the API cannot supply.
 */
export function AttemptsTable({ rows, hasMore, page, perPage }: AttemptsTableProps) {
  const [state, setState] = useQueryStates(attemptsSearchParams);
  const rowCount = (page - 1) * perPage + rows.length + (hasMore ? 1 : 0);

  const { table } = useDataTable({
    data: rows,
    columns: attemptColumns,
    rowCount,
    pageIndex: page - 1,
    pageSize: perPage,
    sorting: [],
    onPaginationChange: (next) => void setState({ page: next.pageIndex + 1, perPage: next.pageSize }),
    onSortingChange: () => {
      /* no server-side sort exists on this endpoint */
    },
  });

  return (
    <>
      <DataTableToolbar
        search={state.q}
        onSearchChange={(value) => void setState({ q: value, page: 1 })}
        hasActiveFilters={state.state !== null}
        onClearFilters={() => void setState({ state: null, page: 1 })}
      >
        <Select
          aria-label={copy.quizAdmin.columnState}
          value={state.state ?? ''}
          onChange={(event) =>
            void setState({
              state: (event.target.value || null) as (typeof ATTEMPT_STATES)[number] | null,
              page: 1,
            })
          }
          className="w-auto"
        >
          <option value="">{copy.quizAdmin.filterAll}</option>
          {Object.entries(STATE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </DataTableToolbar>
      <DataTable table={table} columnCount={attemptColumns.length} />
      <DataTablePagination table={table} />
    </>
  );
}
