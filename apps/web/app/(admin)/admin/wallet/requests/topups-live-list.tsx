'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef } from 'react';
import { Landmark, Smartphone, Wallet } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import {
  AdminWalletTopupListSchema,
  type AdminWalletTopupList,
  type AdminWalletTopupRow,
} from '@ayman/contracts/admin/wallet';
import type { PaymentSubmissionStatus } from '@ayman/contracts/payments';
import { Badge } from '@ayman/ui/components/badge';
import { cn } from '@ayman/ui/lib/cn';
import { apiGet } from '@/lib/api';
import { formatEGPExact } from '@/lib/price';
import { WhatsappButton } from '@/components/admin/whatsapp-button';
import { ListPager } from '@/components/admin/list-controls';
import { AdminEmpty } from '@/components/admin/admin-empty';
import { useWalletTopupsPendingCount } from '@/components/admin/wallet-topups-alerts';
import { LiveStrip, arrivalPhrase, scrollToFirstFresh, useLiveList } from '@/components/admin/live-list';
import { PaymentScreenshotThumbnail } from '../../payments/screenshot-thumbnail';
import { TopupReviewActions } from './topup-review-actions';

const c = copy.admin.wallet;
const cb = copy.admin.books;

const egp = (cents: number) => `${formatEGPExact(cents)} ج`;

/* Cairo, pinned — this renders on the server AND in the browser. */
const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Cairo',
});

const STATUS_HUE: Record<PaymentSubmissionStatus, string> = {
  pending: 'var(--viz-1)',
  approved: 'var(--ok)',
  rejected: 'var(--err)',
};

/**
 * The top-up queue's rows, kept live — the same `useLiveList` the payments
 * queue uses, on the `wallet-topups` queue. The badge's poll is the floor
 * under the stream: on the pending view, a count that disagrees with the rows
 * means a frame was missed, and the list re-reads.
 */
export function TopupsLiveList({
  initial,
  query,
  status,
  page,
  perPage,
  canReview,
}: {
  initial: AdminWalletTopupList;
  query: string;
  status: PaymentSubmissionStatus | 'all';
  page: number;
  perPage: number;
  canReview: boolean;
}) {
  const read = useCallback(
    (signal: AbortSignal) =>
      apiGet(`/api/admin/wallet-topups?${query}`, AdminWalletTopupListSchema, { signal, cache: 'no-store' }),
    [query],
  );
  const { data, fresh, live, request } = useLiveList('wallet-topups', initial, read);

  const pendingCount = useWalletTopupsPendingCount();
  useEffect(() => {
    if (status !== 'pending' || pendingCount === null) return;
    if (pendingCount !== data.rowCount) request();
  }, [status, pendingCount, data.rowCount, request]);

  const listRef = useRef<HTMLUListElement>(null);
  const freshOnScreen = data.rows.filter((row) => fresh.has(row.id)).length;

  return (
    <>
      <LiveStrip
        live={live}
        liveLabel={c.liveOn}
        liveHint={c.liveOnHint}
        arrived={
          status === 'pending' || status === 'all'
            ? arrivalPhrase(freshOnScreen, { one: c.arrivedOne, two: c.arrivedTwo, many: c.arrivedMany })
            : null
        }
        showLabel={c.arrivedShow}
        onShow={() => scrollToFirstFresh(listRef.current)}
      />

      {data.rowCount === 0 ? (
        <AdminEmpty
          spot="payments"
          title={status === 'pending' ? c.empty : c.emptyFiltered}
          hint={status === 'pending' ? c.emptyHint : undefined}
        />
      ) : (
        <ul ref={listRef} className="mt-3 flex flex-col gap-2.5">
          {data.rows.map((row) => (
            <TopupRow key={row.id} row={row} fresh={fresh.has(row.id)} canReview={canReview} />
          ))}
        </ul>
      )}
      <ListPager
        page={page}
        perPage={perPage}
        rowCount={data.rowCount}
        labels={{ previous: cb.pagerPrevious, next: cb.pagerNext, of: cb.pagerOf }}
      />
    </>
  );
}

function TopupRow({ row, fresh, canReview }: { row: AdminWalletTopupRow; fresh: boolean; canReview: boolean }) {
  const MethodIcon = row.method === 'instapay' ? Landmark : Smartphone;
  const methodHue = row.method === 'instapay' ? 'var(--viz-3)' : 'var(--viz-4)';
  return (
    <li
      data-fresh={fresh ? '' : undefined}
      style={{ '--row-hue': STATUS_HUE[row.status], '--method-hue': methodHue } as React.CSSProperties}
      className="live-row flex flex-col gap-3 rounded-xl border border-line border-s-4 border-s-[color:var(--row-hue)] bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--method-hue)_16%,var(--n-2))] text-[color:var(--method-hue)]"
        >
          <MethodIcon className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/wallet/${encodeURIComponent(row.userId)}`}
              className="text-[length:var(--fs-text-base)] font-semibold text-fg underline decoration-dotted decoration-fg-faint underline-offset-4 hover:text-accent-text hover:decoration-solid"
            >
              {row.studentName}
            </Link>
            {fresh ? <Badge tone="accent">{c.freshBadge}</Badge> : null}
            <span className="rounded-full bg-[color-mix(in_oklab,var(--method-hue)_14%,var(--n-2))] px-2 py-0.5 text-[length:var(--fs-text-xs)] font-semibold text-fg">
              {c.via[row.method]}
            </span>
            <span className="rounded-full bg-[color-mix(in_oklab,var(--row-hue)_14%,var(--n-2))] px-2 py-0.5 text-[length:var(--fs-text-xs)] font-semibold text-fg">
              {c.status[row.status]}
            </span>
          </div>
          <p className="mt-1 text-[length:var(--fs-title-3)] font-bold tabular-nums text-fg">
            {formatCopy(c.requested, { amount: egp(row.amountCents) })}
            {row.status === 'approved' && row.approvedAmountCents !== null && row.approvedAmountCents !== row.amountCents ? (
              <span className="ms-2 text-[length:var(--fs-text-sm)] font-semibold text-[color:var(--ok)]">
                {formatCopy(c.approvedAmount, { amount: egp(row.approvedAmountCents) })}
              </span>
            ) : null}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-faint">
            <span className="font-medium text-fg">
              {c.senderFrom} <bdi dir="ltr">{row.sender}</bdi>
            </span>
            {row.studentPhone ? <span dir="ltr">{row.studentPhone}</span> : null}
            <span className="inline-flex items-center gap-1">
              <Wallet className="size-3.5" aria-hidden="true" />
              {formatCopy(c.currentBalance, { amount: egp(row.balanceCents) })}
            </span>
            <time dateTime={row.createdAt}>{dateFormatter.format(new Date(row.createdAt))}</time>
            {row.reviewedBy ? <span>{formatCopy(c.reviewedBy, { name: row.reviewedBy })}</span> : null}
          </p>
          {row.note ? <p className="mt-1.5 text-[length:var(--fs-text-sm)] text-fg">{row.note}</p> : null}
          {row.status === 'rejected' && row.rejectionReason ? (
            <p className="mt-1.5 text-[length:var(--fs-text-sm)] text-err">{row.rejectionReason}</p>
          ) : null}
        </div>
      </div>

      <div className={cn('flex shrink-0 flex-wrap items-center gap-2')}>
        <PaymentScreenshotThumbnail
          id={row.id}
          src={`/api/admin/wallet-topups/${row.id}/screenshot`}
          alt={formatCopy(c.screenshotAlt, { student: row.studentName })}
        />
        <WhatsappButton phone={row.studentPhone} label={c.whatsapp} size="sm" />
        {row.status === 'pending' && canReview ? (
          <TopupReviewActions id={row.id} amountCents={row.amountCents} />
        ) : null}
      </div>
    </li>
  );
}
