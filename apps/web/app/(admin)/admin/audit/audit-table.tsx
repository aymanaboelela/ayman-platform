'use client';

import { useQueryStates } from 'nuqs';
import type { AuditEntry } from '@ayman/contracts/admin/audit';
import { AUDIT_ACTIONS } from '@ayman/contracts/admin/audit';
import { copy } from '@ayman/contracts/copy/admin';
import { Input } from '@ayman/ui/components/input';
import { useDataTable } from '@/components/admin/data-table/use-data-table';
import { DataTable } from '@/components/admin/data-table/data-table';
import { DataTablePagination } from '@/components/admin/data-table/data-table-pagination';
import { auditColumns } from './columns';
import { auditSearchParams } from './search-params';

export interface AuditTableProps {
  rows: AuditEntry[];
  rowCount: number;
  page: number;
  perPage: number;
}

export function AuditTable({ rows, rowCount, page, perPage }: AuditTableProps) {
  const [state, setState] = useQueryStates(auditSearchParams);

  const { table } = useDataTable({
    data: rows,
    columns: auditColumns,
    rowCount,
    pageIndex: page - 1,
    pageSize: perPage,
    sorting: [],
    onPaginationChange: (next) => void setState({ page: next.pageIndex + 1, perPage: next.pageSize }),
    onSortingChange: () => {
      /* no server-side sort — occurredAt DESC only, non-configurable */
    },
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={state.resourceType ?? ''}
          onChange={(event) => void setState({ resourceType: event.target.value || null, page: 1 })}
          placeholder={copy.admin.audit.filterResourceType}
          aria-label={copy.admin.audit.filterResourceType}
          className="max-w-64"
        />
        <Input
          type="search"
          value={state.actorUserId ?? ''}
          onChange={(event) => void setState({ actorUserId: event.target.value || null, page: 1 })}
          placeholder={copy.admin.audit.filterActor}
          aria-label={copy.admin.audit.filterActor}
          className="max-w-64"
        />

        {/*
          «النتيجة» and «الإجراء» — both were BUILT and unreachable.

          The nuqs parsers, the DTO fields, the where-clauses and even the
          Arabic labels have all existed since the screen shipped; the only
          thing missing was a control, so `copy.admin.audit.filterOutcome` had
          zero usages anywhere in the app.

          Outcome first and deliberately: «وريني اللي فشل» is the question this
          log is opened for, and it is three values against ninety-nine.
        */}
        <select
          value={state.outcome ?? ''}
          onChange={(event) =>
            void setState({
              outcome: (event.target.value || null) as typeof state.outcome,
              page: 1,
            })
          }
          aria-label={copy.admin.audit.filterOutcome}
          className="h-9 rounded-lg border border-line bg-surface-2 px-3 text-[length:var(--fs-text-sm)] text-fg"
        >
          <option value="">{copy.admin.audit.filterOutcome}</option>
          <option value="success">{copy.admin.audit.outcomeSuccess}</option>
          <option value="failure">{copy.admin.audit.outcomeFailure}</option>
          <option value="denied">{copy.admin.audit.outcomeDenied}</option>
        </select>

        {/* Ninety-nine actions, so a NATIVE select rather than a styled listbox:
            typing jumps to a match in one, and scrolls a hundred rows in the
            other. `action` is an array server-side — one value covers «ورّيني
            الإجراء ده» and the multi-select it would take to improve on that is
            a control nobody has asked for yet. */}
        <select
          value={state.action[0] ?? ''}
          onChange={(event) =>
            void setState({
              action: (event.target.value ? [event.target.value] : []) as typeof state.action,
              page: 1,
            })
          }
          aria-label={copy.admin.audit.filterAction}
          className="h-9 max-w-64 rounded-lg border border-line bg-surface-2 px-3 text-[length:var(--fs-text-sm)] text-fg"
        >
          <option value="">{copy.admin.audit.filterAction}</option>
          {AUDIT_ACTIONS.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </select>

        {/* «اللي حصل يوم كذا» — validated and applied server-side since the
            endpoint shipped, and unreachable because nothing sent it. */}
        <input
          type="date"
          value={state.from ?? ''}
          onChange={(event) => void setState({ from: event.target.value || null, page: 1 })}
          aria-label={copy.admin.audit.filterFrom}
          className="h-9 rounded-lg border border-line bg-surface-2 px-3 text-[length:var(--fs-text-sm)] text-fg"
        />
        <input
          type="date"
          value={state.to ?? ''}
          onChange={(event) => void setState({ to: event.target.value || null, page: 1 })}
          aria-label={copy.admin.audit.filterTo}
          className="h-9 rounded-lg border border-line bg-surface-2 px-3 text-[length:var(--fs-text-sm)] text-fg"
        />
      </div>
      <DataTable table={table} columnCount={auditColumns.length} />
      <DataTablePagination table={table} />
    </>
  );
}
