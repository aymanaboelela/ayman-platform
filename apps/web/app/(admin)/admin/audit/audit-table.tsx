'use client';

import { useQueryStates } from 'nuqs';
import type { AuditEntry } from '@ayman/contracts/admin/audit';
import { copy } from '@ayman/contracts';
import { Input } from '@ayman/ui';
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
      </div>
      <DataTable table={table} columnCount={auditColumns.length} />
      <DataTablePagination table={table} />
    </>
  );
}
