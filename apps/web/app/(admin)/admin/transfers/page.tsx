import Link from 'next/link';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import {
  AdminTransferFilterSchema,
  AdminTransferListSchema,
  type AdminTransferRow,
} from '@ayman/contracts/admin/transfers';
import { Badge } from '@ayman/ui/components/badge';
import { adminGet } from '@/lib/admin-api';
import { formatEGPExact } from '@/lib/price';
import { ListControl } from '@/components/admin/list-controls';
import { DismissTransferButton, IngestTransfersBox } from './transfer-actions';

const c = copy.admin.transfers;

export const metadata = { title: c.title };

const SOURCE_LABEL = {
  notification: c.sourceNotification,
  sms: c.sourceSms,
  manual: c.sourceManual,
} as const;

const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * `/admin/transfers` — «التحويلات الواردة».
 *
 * Uncached (`adminGet`), like every other admin list: a stale ledger is money
 * that looks unexplained after it has already been explained.
 */
export default async function AdminTransfersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.filter) ? params.filter[0] : params.filter;
  const filter = AdminTransferFilterSchema.catch('unmatched').parse(raw);

  const { rows, rowCount } = await adminGet(
    `/api/admin/transfers?filter=${filter}`,
    AdminTransferListSchema,
  );

  return (
    <>
      <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
        {c.eyebrow}
      </p>
      <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
      <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.subtitle}</p>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <ListControl
          name="filter"
          label={c.filterStatusLabel}
          value={filter}
          options={[
            { value: 'unmatched', label: c.filterUnmatched },
            { value: 'matched', label: c.filterMatched },
            { value: 'dismissed', label: c.filterDismissed },
            { value: 'all', label: c.filterAll },
          ]}
        />
      </div>

      {rowCount === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
          <p className="text-[length:var(--fs-title-4)] font-medium text-fg">{c.empty}</p>
          <p className="mx-auto mt-2 max-w-[34rem] text-[length:var(--fs-text-sm)] text-fg-muted">
            {c.emptyHint}
          </p>
        </div>
      ) : (
        <ul className="mt-5 flex flex-col gap-2.5">
          {rows.map((row) => (
            <TransferRow key={row.id} row={row} />
          ))}
        </ul>
      )}

      <IngestTransfersBox />
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

function TransferRow({ row }: { row: AdminTransferRow }) {
  const matched = row.matchedSubmissionId !== null || row.matchedBookOrderId !== null;

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {/* The amount IS the identity here, so it is never rounded:
              `formatEGPExact` prints piastres only when a transfer actually
              carried them, which for InstaPay is never — and on the day one
              does, hiding them would hide why it matched nothing. */}
          <span className="mono text-[length:var(--fs-title-4)] font-semibold text-fg">
            {row.amountCents === null ? c.unreadable : `${formatEGPExact(row.amountCents)} ج`}
          </span>
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
