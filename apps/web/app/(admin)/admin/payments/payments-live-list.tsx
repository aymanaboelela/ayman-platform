'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef } from 'react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import {
  AdminPaymentListSchema,
  type AdminPaymentList,
  type AdminPaymentRow,
} from '@ayman/contracts/admin/payments';
import type { PaymentSubmissionStatus } from '@ayman/contracts/payments';
import { Badge } from '@ayman/ui/components/badge';
import { apiGet } from '@/lib/api';
import { formatEGP } from '@/lib/price';
import { WhatsappButton } from '@/components/admin/whatsapp-button';
import { ListPager } from '@/components/admin/list-controls';
import { AdminEmpty } from '@/components/admin/admin-empty';
import { usePaymentsPendingCount } from '@/components/admin/payments-alerts';
import {
  LiveStrip,
  arrivalPhrase,
  scrollToFirstFresh,
  useLiveList,
} from '@/components/admin/live-list';
import { PaymentReviewActions } from './review-actions';
import { PaymentScreenshotThumbnail } from './screenshot-thumbnail';

const c = copy.admin.payments;
/** The pager's three words live with the books screen's own list controls —
 *  one vocabulary for every paged admin list, not one per screen. */
const cb = copy.admin.books;

const PLAN_LABEL: Record<Exclude<AdminPaymentRow['plan'], 'term'>, string> = {
  monthly: c.planMonthly,
  quarterly: c.planQuarterly,
  yearly: c.planYearly,
};

/**
 * «شهرين — شهر ٢، شهر ٣» — العربي بيعُد تلات طرق، والرقم المجرّد مش واحدة منهم.
 *
 * «٢ شهر» مش جملة عربية، و«٢ شهور» كمان لأ. المثنى كلمة لوحده.
 */
function monthsPhrase(count: number): string {
  if (count === 1) return c.planMonthsOne;
  if (count === 2) return c.planMonthsTwo;
  return formatCopy(c.planMonthsMany, { count });
}

/**
 * الخطة زي ما الأدمن محتاج يقراها وهو بيوافق.
 *
 * `term` بيسمّي الترم، والشهور بتسمّي نفسها وعددها — وده اللي كان ناقص. الأدمن
 * كان بيشوف «شهر» على دفعة بتشتري تلات شهور، والمبلغ جنبها لوحده مش كفاية
 * يفرّق: ٤٥٠ صح على تلاتة وغلط على واحد.
 *
 * والترتيب من السيرفر (`monthIndex`)، مش من هنا — «شهر ٣ و٢» بتبان كغلطة.
 */
function planLabel(row: AdminPaymentRow): string {
  if (row.plan === 'term') return formatCopy(c.planTerm, { term: row.termTitle ?? '' });
  if (row.months.length > 0) {
    return formatCopy(c.planMonths, {
      count: monthsPhrase(row.months.length),
      months: row.months.map((month) => month.title).join('، '),
    });
  }
  return PLAN_LABEL[row.plan];
}

/*
  Cairo, pinned. This list renders on the server (UTC in the container) AND in
  the browser now, and an unpinned formatter would print two different times
  for one row — a hydration mismatch, and before this the admin was reading
  UTC off a screen whose every other clock is Cairo's.
*/
const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Cairo',
});

/**
 * The review queue's rows, kept live — «الطلب يظهر لوحده من غير ريفرش».
 *
 * The page reads the first render on the server exactly as before; from then
 * on `useLiveList` re-reads the same query whenever the payments desk moves.
 * See `use-live-queue.ts` for why that is a frame on the existing stream and
 * not a poll.
 */
export function PaymentsLiveList({
  initial,
  query,
  status,
  page,
  perPage,
}: {
  initial: AdminPaymentList;
  /** The list endpoint's query string, exactly as the server read it. */
  query: string;
  status: PaymentSubmissionStatus | 'all';
  page: number;
  perPage: number;
}) {
  const read = useCallback(
    (signal: AbortSignal) =>
      apiGet(`/api/admin/payments/submissions?${query}`, AdminPaymentListSchema, {
        signal,
        cache: 'no-store',
      }),
    [query],
  );
  const { data, fresh, live, request } = useLiveList('payments', initial, read);

  /*
    The badge's poll as a floor under the stream. The sidebar reads the SAME
    pending count every thirty seconds whatever happens here; if it moves to a
    number this list does not show, something changed that no frame told us
    about (Redis down, a socket the watchdog has not caught yet) — re-read.
    Only on the pending view: the only one whose `rowCount` is that number.
  */
  const pendingCount = usePaymentsPendingCount();
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
            ? arrivalPhrase(freshOnScreen, {
                one: c.arrivedOne,
                two: c.arrivedTwo,
                many: c.arrivedMany,
              })
            : null
        }
        showLabel={c.arrivedShow}
        onShow={() => scrollToFirstFresh(listRef.current)}
      />

      {data.rowCount === 0 ? (
        <AdminEmpty spot="payments" title={c.empty} hint={c.emptyHint} />
      ) : (
        <ul ref={listRef} className="mt-3 flex flex-col gap-2.5">
          {data.rows.map((row) => (
            <PaymentRow key={row.id} row={row} fresh={fresh.has(row.id)} />
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

function PaymentRow({ row, fresh }: { row: AdminPaymentRow; fresh: boolean }) {
  return (
    <li
      data-fresh={fresh ? '' : undefined}
      className="live-row flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/students/${row.userId}`}
            className="text-[length:var(--fs-text-base)] font-semibold text-fg underline decoration-dotted decoration-fg-faint underline-offset-4 hover:text-accent-text hover:decoration-solid"
          >
            {row.studentName}
          </Link>
          {fresh ? <Badge tone="accent">{c.freshBadge}</Badge> : null}
          <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
            {planLabel(row)}
          </span>
          <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
            {row.approvedBefore > 0
              ? formatCopy(c.approvedBefore, { n: row.approvedBefore })
              : c.approvedBeforeNone}
          </span>
          {/* An admin-comped term — never counted as revenue on
              `/admin/finance`. See the model note on
              `PaymentSubmission.isFree`. */}
          {row.isFree ? <Badge tone="accent">{c.freeBadge}</Badge> : null}
        </div>
        <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{row.courseTitle}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-faint">
          <span className="mono">{formatEGP(row.amountCents)} ج</span>
          {/* The number to reconcile against the real Vodafone Cash
              log — often not the student's own account phone below,
              which is why it carries its own label and this one
              doesn't: unlabelled reads as "the student's number",
              which `studentPhone` already is. `null` for a row
              `adminManualSubscribe` created directly — there is no
              transfer to reconcile, so this says so instead of a
              blank value after the label. */}
          <span dir="ltr" className="font-medium text-fg">
            {row.senderPhone
              ? `${c.senderPhoneLabel}: ${row.senderPhone}`
              : row.paidFromWallet
                ? c.paidFromWallet
                : c.recordedManually}
          </span>
          {row.studentPhone ? <span dir="ltr">{row.studentPhone}</span> : null}
          {row.studentEmail ? <span dir="ltr">{row.studentEmail}</span> : null}
          <time dateTime={row.createdAt}>{dateFormatter.format(new Date(row.createdAt))}</time>
        </p>
        {row.status === 'rejected' && row.rejectionReason ? (
          <p className="mt-1.5 text-[length:var(--fs-text-sm)] text-err">{row.rejectionReason}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* Only when there is one to open — `adminManualSubscribe`
            rows usually have none, and requesting the screenshot
            route for a row without one would just 404. */}
        {row.hasScreenshot ? (
          <PaymentScreenshotThumbnail
            id={row.id}
            alt={formatCopy(c.screenshotAlt, { student: row.studentName })}
          />
        ) : null}
        {/* The student's own account phone, not `senderPhone` above —
            reconciling a Vodafone Cash transfer is one reason to
            reach out, but not the only one, so this follows the
            student rather than the payment. Renders nothing when
            `studentPhone` is unusable — see `WhatsappButton`. */}
        <WhatsappButton phone={row.studentPhone} label={c.whatsapp} size="sm" />
        {row.status === 'pending' ? <PaymentReviewActions id={row.id} /> : null}
      </div>
    </li>
  );
}
