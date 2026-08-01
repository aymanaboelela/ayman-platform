'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { AuditEntry } from '@ayman/contracts/admin/audit';
import { copy } from '@ayman/contracts';
import { Badge } from '@ayman/ui';

/** Western digits, `Africa/Cairo`, regardless of the visitor's own locale —
 *  an audit timestamp must read identically for every admin. */
const TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/**
 * `success` is NEUTRAL, not green — and `denied`/`failure` are `warn`, not
 * `err`. Green and red are reserved for quiz correctness (Global
 * Constraint 9); an audit row recording that a write happened is not a
 * right answer, and one recording that it was denied is not a wrong one.
 */
const OUTCOME_TONE = {
  success: 'neutral',
  failure: 'warn',
  denied: 'warn',
} as const;

const OUTCOME_LABEL = {
  success: copy.admin.audit.outcomeSuccess,
  failure: copy.admin.audit.outcomeFailure,
  denied: copy.admin.audit.outcomeDenied,
} as const;

function truncatedHash(value: string | null): string | null {
  return value ? value.slice(0, 12) : null;
}

export const auditColumns: ColumnDef<AuditEntry, unknown>[] = [
  {
    id: 'occurredAt',
    header: copy.admin.audit.columnTime,
    cell: ({ row }) => (
      <span className="tabular-nums">{TIME_FORMAT.format(new Date(row.original.occurredAt))}</span>
    ),
  },
  {
    id: 'actor',
    header: copy.admin.audit.columnActor,
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="truncate text-fg">{row.original.actorEmail ?? copy.admin.audit.noActor}</p>
        {row.original.actorUserId ? (
          <p className="truncate font-mono text-[length:var(--fs-mono-label)] text-fg-muted">
            {row.original.actorUserId}
          </p>
        ) : null}
      </div>
    ),
  },
  {
    id: 'action',
    header: copy.admin.audit.columnAction,
    cell: ({ row }) => (
      <span className="rounded-[var(--r-xs)] bg-surface-3 px-2 py-0.5 font-mono text-[length:var(--fs-mono-label)] text-fg">
        {row.original.action}
      </span>
    ),
  },
  {
    id: 'resource',
    header: copy.admin.audit.columnResource,
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="truncate text-fg">{row.original.resourceType}</p>
        {row.original.resourceId ? (
          <p className="truncate font-mono text-[length:var(--fs-mono-label)] text-fg-muted">
            {row.original.resourceId}
          </p>
        ) : null}
      </div>
    ),
  },
  {
    id: 'outcome',
    header: copy.admin.audit.columnOutcome,
    cell: ({ row }) => (
      <Badge tone={OUTCOME_TONE[row.original.outcome]}>{OUTCOME_LABEL[row.original.outcome]}</Badge>
    ),
  },
  {
    id: 'metadata',
    header: copy.admin.audit.columnMetadata,
    cell: ({ row }) =>
      row.original.metadata ? (
        <details>
          <summary className="cursor-pointer text-[length:var(--fs-text-sm)] text-accent-text">
            {copy.admin.audit.viewMetadata}
          </summary>
          <pre className="mt-1 max-w-96 overflow-x-auto rounded-[var(--r-sm)] bg-surface-3 p-2 text-[length:var(--fs-mono-label)]">
            {JSON.stringify(row.original.metadata, null, 2)}
          </pre>
        </details>
      ) : (
        '—'
      ),
  },
  {
    id: 'hash',
    header: copy.admin.audit.columnHash,
    cell: ({ row }) => (
      <div className="font-mono text-[length:var(--fs-mono-label)] text-fg-muted">
        <p title={row.original.prevHash ?? undefined}>{truncatedHash(row.original.prevHash) ?? '—'}</p>
        <p title={row.original.hash}>{truncatedHash(row.original.hash)}</p>
      </div>
    ),
  },
];
