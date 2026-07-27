'use client';

import { useQueryStates } from 'nuqs';
import type { ColumnDef } from '@tanstack/react-table';
import type { AdminAppealRow, APPEAL_STATES } from '@ayman/contracts/admin/attempts';
import { copy } from '@ayman/contracts';
import { Badge, Select } from '@ayman/ui';
import { useDataTable } from '@/components/admin/data-table/use-data-table';
import { DataTable } from '@/components/admin/data-table/data-table';
import { DataTablePagination } from '@/components/admin/data-table/data-table-pagination';
import { ResolveAppealButton } from '@/components/admin/quiz/resolve-appeal-button';
import { appealsSearchParams } from './search-params';

const STATE_LABEL = {
  open: copy.appeal.status.open,
  under_review: copy.appeal.status.under_review,
  accepted: copy.appeal.status.accepted,
  rejected: copy.appeal.status.rejected,
} as const;

const STATE_TONE = {
  open: 'accent',
  under_review: 'accent',
  accepted: 'ok',
  rejected: 'err',
} as const;

/**
 * No `enableSorting`: `AppealsService.listForAdmin` has a fixed
 * `orderBy: { createdAt: 'desc' }`. The resolve dialog is Plan 5's own
 * `ResolveAppealButton` — it already implements exactly "accept/reject +
 * mark + note", and a second `resolve-dialog.tsx` here would be a second,
 * divergent write path onto the same `PATCH /api/admin/appeals/:id`.
 */
const appealColumns: ColumnDef<AdminAppealRow, unknown>[] = [
  {
    id: 'studentName',
    accessorKey: 'studentName',
    header: copy.appeal.columnStudent,
  },
  {
    id: 'quizTitle',
    accessorKey: 'quizTitle',
    header: copy.appeal.columnQuiz,
  },
  {
    id: 'reasonAr',
    accessorKey: 'reasonAr',
    header: copy.appeal.columnNote,
    cell: ({ row }) => <p className="max-w-96 truncate">{row.original.reasonAr}</p>,
  },
  {
    id: 'state',
    header: copy.quizAdmin.columnState,
    cell: ({ row }) => <Badge tone={STATE_TONE[row.original.state]}>{STATE_LABEL[row.original.state]}</Badge>,
  },
  {
    id: 'createdAt',
    header: copy.appeal.columnAge,
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleString('ar-EG'),
  },
  {
    id: 'actions',
    header: copy.quizAdmin.columnActions,
    cell: ({ row }) =>
      row.original.state === 'open' || row.original.state === 'under_review' ? (
        <ResolveAppealButton appealId={row.original.id} />
      ) : (
        <span className="text-fg-muted">{row.original.resolutionAr}</span>
      ),
  },
];

export interface AppealsTableProps {
  rows: AdminAppealRow[];
  hasMore: boolean;
  page: number;
  perPage: number;
}

export function AppealsTable({ rows, hasMore, page, perPage }: AppealsTableProps) {
  const [state, setState] = useQueryStates(appealsSearchParams);
  const rowCount = (page - 1) * perPage + rows.length + (hasMore ? 1 : 0);

  const { table } = useDataTable({
    data: rows,
    columns: appealColumns,
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
      <div className="mb-16 flex flex-wrap items-center gap-8">
        <Select
          aria-label={copy.quizAdmin.columnState}
          value={state.state}
          onChange={(event) =>
            void setState({ state: event.target.value as (typeof APPEAL_STATES)[number], page: 1 })
          }
          className="w-auto"
        >
          {Object.entries(STATE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <DataTable table={table} columnCount={appealColumns.length} />
      <DataTablePagination table={table} />
    </>
  );
}
