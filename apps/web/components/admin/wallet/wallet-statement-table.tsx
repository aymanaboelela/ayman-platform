import {
  CircleMinus,
  GraduationCap,
  Landmark,
  Ticket,
  Undo2,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import type { AdminWalletTransaction } from '@ayman/contracts/admin/wallet';
import type { WalletTransactionKind } from '@ayman/contracts/wallet';
import { cn } from '@ayman/ui/lib/cn';
import { formatEGPExact } from '@/lib/price';

const c = copy.admin.wallet;

const WHEN = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Africa/Cairo',
});

const KIND_ICON: Record<WalletTransactionKind, LucideIcon> = {
  admin_credit: Wallet,
  code_topup: Ticket,
  transfer_topup: Landmark,
  refund: Undo2,
  course_purchase: GraduationCap,
  admin_debit: CircleMinus,
};

const KIND_HUE: Record<WalletTransactionKind, string> = {
  admin_credit: 'var(--viz-6)',
  code_topup: 'var(--viz-1)',
  transfer_topup: 'var(--viz-2)',
  refund: 'var(--viz-5)',
  course_purchase: 'var(--viz-3)',
  admin_debit: 'var(--err)',
};

function detailOf(row: AdminWalletTransaction): string | null {
  if (row.courseTitle) return row.courseTitle;
  if (row.method) return c.via[row.method];
  return null;
}

/**
 * The ledger as the admin reads it: what, how much (signed, green in / rose
 * out), the balance after, whether it counted as income, who pressed the
 * button and the note he wrote. A list of cards rather than a table so it
 * reads on a phone — the admin credits a student standing in front of him.
 */
export function WalletStatementTable({
  rows,
  limit,
}: {
  rows: readonly AdminWalletTransaction[];
  /** The student page's panel shows the latest few; the wallet page all. */
  limit?: number;
}) {
  const shown = limit ? rows.slice(0, limit) : rows;
  if (shown.length === 0) {
    return (
      <p className="mt-3 rounded-lg border border-dashed border-line p-6 text-center text-fg-muted">
        {limit ? c.sectionEmpty : c.statementEmpty}
      </p>
    );
  }
  return (
    <ul className="mt-3 flex flex-col gap-2">
      {shown.map((row) => {
        const Icon = KIND_ICON[row.kind];
        const out = row.amountCents < 0;
        const detail = detailOf(row);
        return (
          <li
            key={row.id}
            style={{ '--row-hue': KIND_HUE[row.kind] } as React.CSSProperties}
            className="flex items-start gap-3 rounded-xl border border-line border-s-4 border-s-[color:var(--row-hue)] bg-surface-2 p-3"
          >
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--row-hue)_16%,var(--n-2))] text-[color:var(--row-hue)]"
            >
              <Icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-fg">
                {c.kind[row.kind]}
                {row.code ? (
                  <span className="font-mono text-[length:var(--fs-text-sm)] tracking-wider [direction:ltr] [unicode-bidi:isolate]">
                    {row.code}
                  </span>
                ) : null}
                {row.kind === 'admin_credit' || row.kind === 'code_topup' || row.kind === 'admin_debit' ? (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[length:var(--fs-text-xs)] font-medium',
                      row.countsAsIncome
                        ? 'bg-[color-mix(in_oklab,var(--ok)_14%,var(--n-2))] text-[color:var(--ok)]'
                        : 'bg-surface-3 text-fg-muted',
                    )}
                  >
                    {row.countsAsIncome ? c.incomeChip : c.giftChip}
                  </span>
                ) : null}
              </p>
              {detail ? <p className="truncate text-[length:var(--fs-text-sm)] text-fg-muted">{detail}</p> : null}
              {row.note ? <p className="text-[length:var(--fs-text-sm)] text-fg">{row.note}</p> : null}
              <p className="mt-0.5 text-[length:var(--fs-text-xs)] text-fg-faint">
                {WHEN.format(new Date(row.createdAt))}
                {row.actor ? ` · ${formatCopy(c.by, { name: row.actor.name })}` : ''}
              </p>
            </div>
            <div className="shrink-0 text-end">
              <p
                className={cn(
                  'font-bold tabular-nums [direction:ltr] [unicode-bidi:isolate]',
                  out ? 'text-[color:var(--err)]' : 'text-[color:var(--ok)]',
                )}
              >
                {out ? '−' : '+'}
                {formatEGPExact(Math.abs(row.amountCents))} ج
              </p>
              <p className="text-[length:var(--fs-text-xs)] tabular-nums text-fg-muted">
                {formatEGPExact(row.balanceAfterCents)} ج
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
