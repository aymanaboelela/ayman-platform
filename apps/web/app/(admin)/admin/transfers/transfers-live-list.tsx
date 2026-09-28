'use client';

import Link from 'next/link';
import { useCallback, useRef } from 'react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import {
  AdminTransferListSchema,
  type AdminTransferFilter,
  type AdminTransferList,
  type AdminTransferRow,
} from '@ayman/contracts/admin/transfers';
import { Badge } from '@ayman/ui/components/badge';
import { apiGet } from '@/lib/api';
import { formatEGPExact } from '@/lib/price';
import { AdminEmpty } from '@/components/admin/admin-empty';
import {
  LiveStrip,
  arrivalPhrase,
  scrollToFirstFresh,
  useLiveList,
} from '@/components/admin/live-list';
import { DismissTransferButton } from './transfer-actions';

const c = copy.admin.transfers;

const SOURCE_LABEL = {
  notification: c.sourceNotification,
  sms: c.sourceSms,
  manual: c.sourceManual,
} as const;

/* Cairo, pinned — see the same note in `payments/payments-live-list.tsx`. */
const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Cairo',
});

/**
 * «التحويلات الواردة», kept live — the ledger beside the review queue, on the
 * same `payments` queue frame.
 *
 * The two screens move together: a transfer landing is what approves a claim
 * on its own, and a manual approval is what links a transfer to a student. One
 * redrawing while the other sat still would be the platform contradicting
 * itself on two adjacent screens.
 */
export function TransfersLiveList({
  initial,
  filter,
}: {
  initial: AdminTransferList;
  filter: AdminTransferFilter;
}) {
  const read = useCallback(
    (signal: AbortSignal) =>
      apiGet(`/api/admin/transfers?filter=${filter}`, AdminTransferListSchema, {
        signal,
        cache: 'no-store',
      }),
    [filter],
  );
  const { data, fresh, live } = useLiveList('payments', initial, read);
  const listRef = useRef<HTMLUListElement>(null);
  const freshOnScreen = data.rows.filter((row) => fresh.has(row.id)).length;

  return (
    <>
      <LiveStrip
        live={live}
        liveLabel={copy.admin.payments.liveOn}
        liveHint={c.liveOnHint}
        arrived={arrivalPhrase(freshOnScreen, {
          one: c.arrivedOne,
          two: c.arrivedTwo,
          many: c.arrivedMany,
        })}
        showLabel={copy.admin.payments.arrivedShow}
        onShow={() => scrollToFirstFresh(listRef.current)}
      />

      {data.rowCount === 0 ? (
        <AdminEmpty spot="transfers" title={c.empty} hint={c.emptyHint} />
      ) : (
        <ul ref={listRef} className="mt-3 flex flex-col gap-2.5">
          {data.rows.map((row) => (
            <TransferRow key={row.id} row={row} fresh={fresh.has(row.id)} />
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * The one sentence this row is worth.
 *
 * Four different situations end up in the same list and they need different
 * things from the reader: one is settled, one is a stranger's money, one is a
 * student the platform recognises who happens to owe nothing, and one is a
 * line the parser could not read. Rendering the same «مفيش اشتراك مستني» under
 * all of them would make the only screen that reports unexplained money
 * useless for explaining any of it.
 */
function explain(row: AdminTransferRow): string {
  if (row.amountCents === null) return c.unreadableHint;
  if (row.matchedSubmissionId !== null) {
    return formatCopy(c.matchedTo, {
      course: row.matchedCourseTitle ?? '',
      student: row.matchedStudentName ?? '',
    });
  }
  if (row.matchedBookOrderId !== null) {
    return row.matchedStudentName === null
      ? c.matchedBookGuest
      : formatCopy(c.matchedBook, { student: row.matchedStudentName });
  }
  // An SMS names nobody, so it can never approve anything — see
  // `TransfersService.settle`. Saying so stops it reading as a failure.
  if (row.senderHandle === null) return c.noSenderHint;
  if (row.senderStudentName !== null) {
    return formatCopy(c.knownSenderHint, { student: row.senderStudentName });
  }
  return c.unknownSenderHint;
}

function TransferRow({ row, fresh }: { row: AdminTransferRow; fresh: boolean }) {
  const matched = row.matchedSubmissionId !== null || row.matchedBookOrderId !== null;

  return (
    <li
      data-fresh={fresh ? '' : undefined}
      className="live-row flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {/* The amount IS the identity here, so it is never rounded:
              `formatEGPExact` prints piastres only when a transfer actually
              carried them, which for InstaPay is never — and on the day one
              does, hiding them would hide why it matched nothing. */}
          <span className="mono text-[length:var(--fs-title-4)] font-semibold text-fg">
            {row.amountCents === null ? c.unreadable : `${formatEGPExact(row.amountCents)} ج`}
          </span>
          {fresh ? <Badge tone="accent">{copy.admin.payments.freshBadge}</Badge> : null}
          <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
            {SOURCE_LABEL[row.source]}
          </span>
          {matched ? <Badge tone="accent">{c.filterMatched}</Badge> : null}
          {row.dismissedAt !== null ? <Badge>{c.dismissedBadge}</Badge> : null}
        </div>

        <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg">{explain(row)}</p>

        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-faint">
          {/* THE identifier — `StudentPaymentAddress` is what turns it into a
              student. Shown in full because an admin recognising an address by
              eye is exactly how the platform learns its first one. */}
          {row.senderHandle ? (
            <span dir="ltr" className="font-medium text-fg-muted">
              {row.senderHandle}
            </span>
          ) : null}
          <time dateTime={row.receivedAt}>{dateFormatter.format(new Date(row.receivedAt))}</time>
        </p>

        {/* The line the parser read. Shown for an unreadable row (it is the
            only thing there is to go on) and for a matched one only as the
            evidence behind an approval nobody clicked. */}
        <p dir="auto" className="mt-1.5 break-words text-[length:var(--fs-text-xs)] text-fg-faint">
          {row.rawLine}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {matched ? (
          <Link
            href={row.matchedBookOrderId !== null ? '/admin/books' : '/admin/payments?status=approved'}
            className="text-[length:var(--fs-text-sm)] text-accent-text underline decoration-dotted underline-offset-4"
          >
            {row.matchedBookOrderId !== null ? copy.admin.books.title : copy.admin.payments.title}
          </Link>
        ) : row.dismissedAt === null ? (
          <DismissTransferButton id={row.id} />
        ) : null}
      </div>
    </li>
  );
}
