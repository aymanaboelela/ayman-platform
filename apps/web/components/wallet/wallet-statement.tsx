import {
  CircleMinus,
  Clock3,
  GraduationCap,
  History,
  Landmark,
  ReceiptText,
  Ticket,
  Undo2,
  Wallet,
} from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import type { WalletTopup, WalletTransaction, WalletTransactionKind } from '@ayman/contracts/wallet';
import { cn } from '@ayman/ui/lib/cn';
import { formatEGPExact } from '@/lib/price';

const c = copy.wallet;

/** Cairo time, Western digits — the same convention as every date here. */
const WHEN = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: 'numeric',
  month: 'long',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Africa/Cairo',
});

const KIND_ICON: Record<WalletTransactionKind, typeof Wallet> = {
  admin_credit: Wallet,
  code_topup: Ticket,
  transfer_topup: Landmark,
  refund: Undo2,
  course_purchase: GraduationCap,
  admin_debit: CircleMinus,
};

/** What the line was, in the words the student would use for it. */
function titleOf(row: WalletTransaction): string {
  const base = c.kind[row.kind];
  if ((row.kind === 'course_purchase' || row.kind === 'refund') && row.courseTitle) {
    return `${base} — ${row.courseTitle}`;
  }
  if (row.kind === 'transfer_topup' && row.method) return `${base} — ${c.via[row.method]}`;
  return base;
}

/** A signed amount with its sign where a reader of either script expects it. */
function signed(cents: number): string {
  return `${cents < 0 ? '−' : '+'}${formatEGPExact(Math.abs(cents))}`;
}

/**
 * «حركة المحفظة» — the ledger, newest first, one line per row the server
 * wrote. Every line is a green «+» or a rose «−», the icon of what it was,
 * when, and the balance right after it — so the running total is checkable
 * by eye, which is the point of showing a statement rather than a number.
 */
export function WalletStatement({ transactions }: { transactions: readonly WalletTransaction[] }) {
  return (
    <section className="mt-10" aria-labelledby="wl-history-title">
      <h2 id="wl-history-title" className="wl-section-title">
        <History className="size-5 text-[var(--viz-2)]" aria-hidden="true" />
        {c.historyTitle}
      </h2>
      {transactions.length === 0 ? (
        <p className="wl-empty">
          <ReceiptText className="size-5 shrink-0" aria-hidden="true" />
          {c.historyEmpty}
        </p>
      ) : (
        <ul className="wl-statement">
          {transactions.map((row) => {
            const Icon = KIND_ICON[row.kind];
            const out = row.amountCents < 0;
            return (
              <li key={row.id} className="wl-row">
                <span
                  className={cn('wl-row__icon', `wl-row__icon--${row.kind}`, out && 'wl-row__icon--out')}
                  aria-hidden="true"
                >
                  <Icon className="size-5" />
                </span>
                <span className="wl-row__body">
                  <span className="wl-row__title">
                    {titleOf(row)}
                    {row.code ? (
                      <>
                        {' '}
                        <span className="wl-code-tag">{row.code}</span>
                      </>
                    ) : null}
                  </span>
                  <span className="wl-row__meta">
                    {WHEN.format(new Date(row.createdAt))} ·{' '}
                    {formatCopy(c.balanceAfter, { amount: formatEGPExact(row.balanceAfterCents) })}
                  </span>
                </span>
                <span className={cn('wl-row__amount', out && 'wl-row__amount--out')}>{signed(row.amountCents)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** «طلبات الشحن» — only drawn when there are any. A rejected one keeps the
 *  admin's reason on it, verbatim, like a rejected payment does. */
export function WalletRequests({ topups }: { topups: readonly WalletTopup[] }) {
  if (topups.length === 0) return null;
  return (
    <section className="wl-card" aria-labelledby="wl-requests-title">
      <h2 id="wl-requests-title" className="wl-section-title">
        <Clock3 className="size-5 text-[var(--viz-1)]" aria-hidden="true" />
        {c.requestsTitle}
      </h2>
      <ul className="wl-requests">
        {topups.map((topup) => (
          <li key={topup.id} className={cn('wl-request', `wl-request--${topup.status}`)}>
            <div className="wl-request__top">
              <span className="wl-request__amount">
                {formatCopy(c.requestAmount, { amount: formatEGPExact(topup.amountCents) })}
              </span>
              <span className="wl-status">{c.status[topup.status]}</span>
            </div>
            <span className="wl-request__meta">
              {c.via[topup.method]} · {WHEN.format(new Date(topup.createdAt))}
            </span>
            {topup.status === 'approved' && topup.approvedAmountCents !== null ? (
              <span className="wl-request__meta">
                {formatCopy(c.approvedAmount, { amount: formatEGPExact(topup.approvedAmountCents) })}
              </span>
            ) : null}
            {topup.status === 'rejected' && topup.rejectionReason ? (
              <span className="wl-request__reason">{topup.rejectionReason}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
