import Link from 'next/link';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { AdminBookOrderListSchema } from '@ayman/contracts/admin/book-orders';
import { BookOrderStatusSchema, type BookOrderStatus } from '@ayman/contracts/book-orders';
import { cn } from '@ayman/ui';
import { adminGet } from '@/lib/admin-api';
import { formatEGP } from '@/lib/price';
import { WhatsappButton } from '@/components/admin/whatsapp-button';
import { ShipAction } from './ship-action';
import { BookOrderScreenshotThumbnail } from './screenshot-thumbnail';

const c = copy.admin.books;

export const metadata = { title: c.title };

const FILTERS: { value: BookOrderStatus | 'all'; label: string }[] = [
  { value: 'paid', label: c.filterPaid },
  { value: 'address_only', label: c.filterAddressOnly },
  { value: 'shipped', label: c.filterShipped },
  { value: 'all', label: c.filterAll },
];

const STATUS_LABEL: Record<BookOrderStatus, string> = {
  address_only: c.statusAddressOnly,
  paid: c.statusPaid,
  shipped: c.statusShipped,
};

const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * `/admin/books` — الكتاب الورقي, the shipping queue.
 *
 * Same server-component + `adminGet` (uncached) shape as `/admin/payments`
 * and `/admin/finance`. `paid` (paid, not yet shipped — see
 * `BookOrdersService.exportXlsx`'s own note on why `status: 'paid'` already
 * IS that set) is the default tab: it is the one an admin checks daily.
 * `address_only` (started, never finished paying) stays on its own tab,
 * never merged into the same list — asked for by name.
 */
export default async function AdminBooksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.status) ? params.status[0] : params.status;
  const status: BookOrderStatus | 'all' =
    raw === 'all' ? 'all' : BookOrderStatusSchema.safeParse(raw).success ? (raw as BookOrderStatus) : 'paid';

  const { rows, rowCount } = await adminGet(
    `/api/admin/book-orders?perPage=50${status === 'all' ? '' : `&status=${status}`}`,
    AdminBookOrderListSchema,
  );

  return (
    <>
      <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
        {c.eyebrow}
      </p>
      <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
      <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.subtitle}</p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1.5">
          {FILTERS.map((option) => (
            <Link
              key={option.value}
              href={`/admin/books?status=${option.value}`}
              aria-current={option.value === status ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-[length:var(--fs-text-sm)]',
                'transition-colors duration-[160ms] ease-out',
                option.value === status
                  ? 'border-accent bg-accent text-[#1A1206]'
                  : 'border-line text-fg-muted hover:border-accent/40 hover:text-fg',
              )}
            >
              {option.label}
            </Link>
          ))}
        </nav>

        {/* The export needs ONE concrete status — `all` has no meaning for a
            spreadsheet handed to a shipping company, so the button reads the
            SAME tab that is open rather than a hidden default the admin
            cannot see. */}
        {status !== 'all' ? (
          <a
            href={`/api/admin/book-orders/export?status=${status}`}
            className="rounded-full border border-line px-3.5 py-1.5 text-[length:var(--fs-text-sm)] text-fg-muted transition-colors duration-[160ms] ease-out hover:border-accent/40 hover:text-fg"
            title={c.exportHint}
          >
            {formatCopy(c.exportButton, { tab: STATUS_LABEL[status] })}
          </a>
        ) : null}
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
            <li
              key={row.id}
              className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/students/${row.userId}`}
                    className="text-[length:var(--fs-text-base)] font-semibold text-fg underline decoration-dotted decoration-fg-faint underline-offset-4 hover:text-accent-text hover:decoration-solid"
                  >
                    {row.studentName}
                  </Link>
                  <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                    {row.bookTitle}
                  </span>
                  <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                    {STATUS_LABEL[row.status]}
                  </span>
                </div>
                <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{row.courseTitle}</p>
                <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg">
                  {formatCopy(c.addressLine, {
                    name: row.fullName,
                    governorate: row.governorateNameAr,
                    street: row.addressStreet,
                    building: row.addressBuilding,
                  })}
                  {row.addressNote ? ` — ${row.addressNote}` : ''}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-faint">
                  <span className="mono">{formatEGP(row.amountCents)} ج</span>
                  <span dir="ltr">{row.phone}</span>
                  <span dir="ltr">
                    {c.altPhoneLabel}: {row.altPhone}
                  </span>
                  {row.senderPhone ? (
                    <span dir="ltr">
                      {c.senderPhoneLabel}: {row.senderPhone}
                    </span>
                  ) : null}
                  <time dateTime={row.createdAt}>{dateFormatter.format(new Date(row.createdAt))}</time>
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {row.hasScreenshot ? (
                  <BookOrderScreenshotThumbnail
                    id={row.id}
                    alt={formatCopy(c.screenshotAlt, { student: row.studentName })}
                  />
                ) : null}
                <WhatsappButton phone={row.studentPhone} label={c.whatsapp} size="sm" />
                {row.status === 'paid' ? <ShipAction id={row.id} /> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
