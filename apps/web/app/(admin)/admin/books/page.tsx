import Link from 'next/link';
import { z } from 'zod';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { AdminBookOrderListSchema } from '@ayman/contracts/admin/book-orders';
import { AdminBookRowSchema } from '@ayman/contracts/admin/books';
import { BookOrderStatusSchema, type BookOrderStatus } from '@ayman/contracts/book-orders';
import { TaxonomySchema } from '@ayman/contracts/taxonomy';
import { cn } from '@ayman/ui';
import { apiGet } from '@/lib/api';
import { adminGet } from '@/lib/admin-api';
import { formatEGP } from '@/lib/price';
import { WhatsappButton } from '@/components/admin/whatsapp-button';
import { ShipAction } from './ship-action';
import { BookOrderScreenshotThumbnail } from './screenshot-thumbnail';
import { CreateBookOrderDialog } from './create-book-order-dialog';
import { EditBookOrderDialog } from './edit-order-dialog';
import { BooksTabs } from './books-tabs';

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

  const [{ rows, rowCount }, taxonomy, courses, books] = await Promise.all([
    adminGet(
      `/api/admin/book-orders?perPage=50${status === 'all' ? '' : `&status=${status}`}`,
      AdminBookOrderListSchema,
    ),
    apiGet('/api/taxonomy', TaxonomySchema),
    adminGet(
      '/api/admin/courses',
      z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          status: z.string(),
          bookTitle: z.string().nullable(),
          bookPriceCents: z.number().int().nullable(),
        }),
      ),
    ),
    /* The catalogue, for «أعدل الطلب»'s own «ضيف كتاب» picker. Fetched on the
       ORDERS page because that is where the editor lives — a client component
       cannot read it itself without a per-row request. */
    adminGet('/api/admin/books', z.array(AdminBookRowSchema)),
  ]);

  // Only courses with an actual book to order — same gate
  // `BookOrdersService.create`/`adminCreate` both run server-side.
  const bookableCourses = courses
    .filter(
      (course) =>
        course.status === 'published' && course.bookTitle !== null && course.bookPriceCents !== null,
    )
    .map((course) => ({
      id: course.id,
      title: course.title,
      bookTitle: course.bookTitle as string,
      bookPriceCents: course.bookPriceCents as number,
    }));

  const governorateOptions = taxonomy.governorates
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <>
      <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
        {c.eyebrow}
      </p>
      <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
      <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.subtitle}</p>

      <BooksTabs active="/admin/books" />

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

        <div className="flex flex-wrap items-center gap-2">
          <CreateBookOrderDialog courses={bookableCourses} governorates={governorateOptions} />

          {/* The export needs ONE concrete status — `all` has no meaning for
              a spreadsheet handed to a shipping company, so the button reads
              the SAME tab that is open rather than a hidden default the
              admin cannot see. */}
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
                  {/* The order's OWN `fullName` is the source of truth for
                      shipping regardless of whether an account exists — a
                      linked account (`row.userId`) is incidental, so it only
                      adds a link, never the displayed name itself. A guest
                      order (`row.userId === null`) gets a plain label and a
                      badge instead of a dead link to `/admin/students/null`. */}
                  {row.userId ? (
                    <Link
                      href={`/admin/students/${row.userId}`}
                      className="text-[length:var(--fs-text-base)] font-semibold text-fg underline decoration-dotted decoration-fg-faint underline-offset-4 hover:text-accent-text hover:decoration-solid"
                    >
                      {row.fullName}
                    </Link>
                  ) : (
                    <span className="text-[length:var(--fs-text-base)] font-semibold text-fg">
                      {row.fullName}
                    </span>
                  )}
                  {!row.userId ? (
                    <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                      {c.guestLabel}
                    </span>
                  ) : null}
                  {/* «كل واحد عايز كام كتاب» — the order's own lines, not one
                      title. An order that predates the shop has exactly one,
                      back-filled by the migration, so there are no two shapes
                      to render. */}
                  <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                    {formatCopy(c.itemsSummary, {
                      n: row.items.length,
                      copies: row.items.reduce((sum, item) => sum + item.quantity, 0),
                    })}
                  </span>
                  <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                    {STATUS_LABEL[row.status]}
                  </span>
                </div>

                <ul className="mt-1 text-[length:var(--fs-text-sm)] text-fg">
                  {row.items.map((item, index) => (
                    <li key={`${item.bookId ?? 'custom'}-${index}`}>
                      {formatCopy(c.itemLine, {
                        title: item.titleAr,
                        quantity: item.quantity,
                        amount: formatEGP(item.unitPriceCents * item.quantity),
                      })}
                    </li>
                  ))}
                </ul>

                {row.courseTitle ? (
                  <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
                    {row.courseTitle}
                  </p>
                ) : null}
                <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg">
                  {formatCopy(c.addressLine, {
                    name: row.fullName,
                    governorate: row.governorateNameAr,
                    city: row.city,
                    street: row.addressStreet,
                  })}
                  {row.addressBuilding
                    ? formatCopy(c.addressLineBuilding, { building: row.addressBuilding })
                    : ''}
                  {row.addressNote ? ` — ${row.addressNote}` : ''}
                </p>
                {/* The breakdown, not just the total: «الشحن ٦٥» is the number
                    customers phone about, and an admin answering that call
                    should not have to open the editor to find it. */}
                <p className="mt-1 text-[length:var(--fs-text-sm)] font-medium text-fg">
                  {formatCopy(
                    row.discountCents > 0 ? c.breakdownWithDiscount : c.breakdown,
                    {
                      items: formatEGP(row.itemsCents),
                      shipping: formatEGP(row.shippingCents),
                      discount: formatEGP(row.discountCents),
                      total: formatEGP(row.amountCents),
                    },
                  )}
                </p>

                {row.adminNote ? (
                  <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
                    {c.adminNoteLabel}: {row.adminNote}
                  </p>
                ) : null}

                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-faint">
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
                    alt={formatCopy(c.screenshotAlt, { student: row.fullName })}
                  />
                ) : null}
                {/* `row.phone` — the order's OWN contact number, always
                    present regardless of whether an account exists — is the
                    right number to reach about THIS delivery, not the
                    account holder's (possibly different, possibly absent
                    for a guest) `studentPhone`. */}
                <WhatsappButton phone={row.phone} label={c.whatsapp} size="sm" />
                {/* A button on every row. «أعدل» before «اتشحن» because it is the
                    one that is reversible. */}
                <EditBookOrderDialog
                  order={row}
                  books={books}
                  governorates={governorateOptions}
                />
                {row.status === 'paid' ? <ShipAction id={row.id} /> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
