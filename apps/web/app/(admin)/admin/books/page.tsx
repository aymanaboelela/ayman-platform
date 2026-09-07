import Link from 'next/link';
import { z } from 'zod';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import {
  AdminBookOrderFilterSchema,
  AdminBookOrderListSchema,
  type AdminBookOrderFilter,
} from '@ayman/contracts/admin/book-orders';
import {
  AdminBookOrderSortSchema,
  AdminBookOrderStreamSchema,
} from '@ayman/contracts/admin/book-orders';
import { AdminBookRowSchema } from '@ayman/contracts/admin/books';
import { type BookOrderStatus } from '@ayman/contracts/book-orders';
import { cn } from '@ayman/ui';
import { getTaxonomyOrNull } from '@/lib/taxonomy';
import { adminGet } from '@/lib/admin-api';
import { formatEGP } from '@/lib/price';
import { StreamBadge } from '@/components/stream-badge';
import { WhatsappButton } from '@/components/admin/whatsapp-button';
import { bookLineStream } from './line-stream';
import {
  DeliverAction,
  RejectOrderAction,
  RemoveOrderAction,
  RestoreOrderAction,
} from './order-actions';
import { ShipAction } from './ship-action';
import { BulkShipProvider, OrderCheckbox } from './bulk-ship';
import { ExportRange } from './export-range';
import { BookOrderScreenshotThumbnail } from './screenshot-thumbnail';
import { CreateBookOrderDialog } from './create-book-order-dialog';
import { EditBookOrderDialog } from './edit-order-dialog';
import { BooksTabs } from './books-tabs';
import { ListControl, ListPager } from '@/components/admin/list-controls';

const c = copy.admin.books;

/** Fifty was already the page size; what was missing was a way to reach page
 *  two. See `ListPager`. */
const PER_PAGE = 50;

/** «أولى» / «تانية» / «تالتة» — the three secondary years, in order. Indexed by
 *  `year - 1`, so the labels and the numbers cannot drift apart. */
const YEAR_LABEL = ['أولى', 'تانية', 'تالتة'] as const;

/** The `year` filter, parsed rather than cast — same rule as `sort` below. */
const YearFilterSchema = z.coerce.number().int().min(1).max(3);

export const metadata = { title: c.title };

/**
 * What the tab bar can be set to: every real status, «الكل», and «المحذوفة».
 *
 * ⚠️ `deleted` is a VIEW, never a status — see `AdminBookOrderFilterSchema`'s
 * own note. A soft-deleted order KEEPS the status it was hidden in («مدفوعة»,
 * usually), which is the one thing the admin looking at that tab needs to see,
 * and a `deleted` member of `BookOrderStatus` would have erased it.
 */
type Tab = AdminBookOrderFilter | 'all';

/** Each tab's own label. `Record<Tab, …>` on purpose: a sixth filter added to
 *  the contract is a compile error here rather than a tab nobody rendered. */
const TAB_LABEL: Record<Tab, string> = {
  paid: c.filterPaid,
  shipped: c.filterShipped,
  delivered: c.filterDelivered,
  address_only: c.filterAddressOnly,
  rejected: c.filterRejected,
  all: c.filterAll,
  deleted: c.filterDeleted,
};

/**
 * In the order the work actually flows, not the order the enum is declared in.
 *
 * «مدفوعة» first because it is the daily queue — parcels owed to somebody right
 * now. Then the two states that follow one out of the door. «بدأت ومكملتش» sits
 * after those three rather than second: it is a list to chase, not a list to
 * pack. «مرفوضة» and «المحذوفة» are archives, and «المحذوفة» is last because it
 * is the only tab whose rows are hidden from every other screen.
 */
const TABS: Tab[] = ['paid', 'shipped', 'delivered', 'address_only', 'rejected', 'all', 'deleted'];

/** The chip ON a row — «مدفوعة، لسه ماتشحنتش» rather than the tab's «مدفوعة».
 *  A tab names a list; a chip has room to say what the state actually means. */
const STATUS_LABEL: Record<BookOrderStatus, string> = {
  address_only: c.statusAddressOnly,
  paid: c.statusPaid,
  shipped: c.statusShipped,
  delivered: c.statusDelivered,
  rejected: c.statusRejected,
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
  const status: Tab =
    raw === 'all'
      ? 'all'
      : AdminBookOrderFilterSchema.safeParse(raw).success
        ? (raw as AdminBookOrderFilter)
        : 'paid';
  /* «عشان أعرف أوصل» — the name/phone/address box. Trimmed here as well as
     server-side so an accidental space does not make the page render as
     "searching" (results count, clear button) for a search that is empty. */
  const rawQuery = Array.isArray(params.q) ? params.q[0] : params.q;
  const query = (rawQuery ?? '').trim().slice(0, 120);

  /* Sort, stream, year and page, all read THROUGH their schemas rather than
     cast: these land in a query string the API re-validates, and junk should
     render as the default rather than as an error page. */
  const one = (key: string): string | undefined => {
    const value = Array.isArray(params[key]) ? params[key][0] : params[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
  };
  const sort = AdminBookOrderSortSchema.catch('oldest').parse(one('sort'));
  const stream = AdminBookOrderStreamSchema.safeParse(one('stream')).data;
  const year = YearFilterSchema.safeParse(one('year')).data;
  const page = Math.max(1, Number(one('page') ?? 1) || 1);

  const listQuery = new URLSearchParams({ perPage: String(PER_PAGE), page: String(page), sort });
  if (status !== 'all') listQuery.set('status', status);
  if (query) listQuery.set('q', query);
  if (stream) listQuery.set('stream', stream);
  if (year !== undefined) listQuery.set('year', String(year));

  const [{ rows, rowCount }, taxonomy, books] = await Promise.all([
    adminGet(`/api/admin/book-orders?${listQuery}`, AdminBookOrderListSchema),
    /* ⚠️ `getTaxonomyOrNull()`, not `apiGet('/api/taxonomy', …)`. The throwing
       uncached read is what 500'd `/admin/students` for seven minutes after a
       deploy on 2026-09-04: `apiGet` forwards no cookie, so every server-side
       taxonomy read in the fleet shares one rate-limit identity, and a cold
       cache after a container restart empties that bucket. Here the data only
       labels a select, so `null` costs an empty dropdown rather than the
       screen. Kept from `main` through this branch's merge — the orders screen
       must not be the one place that reintroduces it. */
    getTaxonomyOrNull(),
    /* The catalogue — for «أعدل الطلب»'s «ضيف كتاب» picker AND for «أضف طلب
       كتاب»'s own list. Fetched on the ORDERS page because that is where both
       dialogs live; a client component cannot read it without a per-row
       request.

       ⚠️ `/api/admin/courses` is deliberately NOT fetched here any more. The
       create dialog used to build its list from courses carrying the legacy
       `bookTitle`/`bookPriceCents` pair — the only thing that was ever on sale
       before the shop existed. That pair is not the source of truth now:
       `books` is, a book can belong to no course at all, and a course's own
       textbook is a catalogue row with `courseId` set. Filtering courses on the
       old pair made every standalone title unorderable from this screen and
       every NEW course textbook invisible to it. */
    adminGet('/api/admin/books', z.array(AdminBookRowSchema)),
  ]);

  const governorateOptions = (taxonomy?.governorates ?? [])
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

      {/* A plain GET form, no client component: the result IS the URL, so a
          search an admin found someone with can be sent to a colleague, and
          the back button walks searches the way it walks tabs. `status` rides
          along in a hidden field because submitting a form replaces the query
          string wholesale — without it, every search would silently throw the
          admin back to the default tab. */}
      <form action="/admin/books" className="mt-4 flex flex-wrap items-center gap-2">
        {status !== 'paid' ? <input type="hidden" name="status" value={status} /> : null}
        <label htmlFor="q" className="sr-only">
          {c.searchLabel}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={query}
          placeholder={c.searchPlaceholder}
          aria-label={c.searchLabel}
          className="h-10 min-w-0 flex-1 rounded-full border border-line bg-surface-2 px-4 text-[length:var(--fs-text-sm)] text-fg placeholder:text-fg-faint sm:max-w-[26rem]"
        />
        <button
          type="submit"
          className="h-10 shrink-0 rounded-full bg-accent px-5 text-[length:var(--fs-text-sm)] font-medium text-[#1A1206]"
        >
          {c.searchSubmit}
        </button>
        {query ? (
          <Link
            href={`/admin/books?status=${status}`}
            className="h-10 shrink-0 rounded-full border border-line px-4 text-[length:var(--fs-text-sm)] leading-10 text-fg-muted transition-colors duration-[160ms] ease-out hover:border-accent/40 hover:text-fg"
          >
            {c.searchClear}
          </Link>
        ) : null}
      </form>

      {/* The provider wraps the toolbar as well as the list: «حدّد اللي في
          المدى» lives beside the export it mirrors, and it needs the same
          selection the checkboxes below write into. */}
      <BulkShipProvider>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <nav className="flex flex-wrap gap-1.5">
            {TABS.map((tab) => (
              <Link
                key={tab}
                /* The search survives a tab change — the whole reason to switch
                   tabs mid-search is that the order was not in this one. */
                href={`/admin/books?status=${tab}${query ? `&q=${encodeURIComponent(query)}` : ''}`}
                aria-current={tab === status ? 'page' : undefined}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-[length:var(--fs-text-sm)]',
                  'transition-colors duration-[160ms] ease-out',
                  tab === status
                    ? 'border-accent bg-accent text-[#1A1206]'
                    : 'border-line text-fg-muted hover:border-accent/40 hover:text-fg',
                  /* The archive of hidden rows reads as an archive even when it
                     is not the open tab — it is the one list whose contents are
                     invisible everywhere else. */
                  tab === 'deleted' && tab !== status ? 'border-dashed' : '',
                )}
              >
                {TAB_LABEL[tab]}
              </Link>
            ))}
          </nav>

          <div className="flex flex-wrap items-end gap-2">
            {/* «يبقى فيه sorting قدامي وأبقى شايفه» — and «لغات أو عربي، أو
                أولى أو تانية، ده في الكتب، مهمة أوي أوي أوي». Three dropdowns
                rather than three more rows of chips; see `ListControl`. */}
            <ListControl
              name="sort"
              label={c.sortLabel}
              value={sort}
              options={[
                { value: 'oldest', label: c.sortOldest },
                { value: 'newest', label: c.sortNewest },
                { value: 'amount_desc', label: c.sortAmountDesc },
                { value: 'amount_asc', label: c.sortAmountAsc },
                { value: 'name_asc', label: c.sortNameAsc },
                { value: 'governorate', label: c.sortGovernorate },
              ]}
            />
            <ListControl
              name="stream"
              label={c.streamLabel}
              value={stream ?? ''}
              options={[
                { value: '', label: c.streamAll },
                { value: 'general', label: c.streamGeneral },
                { value: 'languages', label: c.streamLanguages },
              ]}
            />
            <ListControl
              name="year"
              label={c.yearLabel}
              value={year === undefined ? '' : String(year)}
              options={[
                { value: '', label: c.yearAll },
                ...[1, 2, 3].map((n) => ({
                  value: String(n),
                  label: formatCopy(c.yearOption, { year: YEAR_LABEL[n - 1] as string }),
                })),
              ]}
            />
            <CreateBookOrderDialog
              /* Active titles only — an order for a book that is off the shelf is
                 an order the shop has said it is not taking. `courseTitle` rides
                 along as a LABEL, so «كتاب الترم الأول» under three different
                 courses is three distinguishable options. */
              books={books
                .filter((book) => book.isActive)
                .map((book) => ({
                  id: book.id,
                  titleAr: book.titleAr,
                  priceCents: book.priceCents,
                  courseTitle: book.courseTitle,
                }))}
              governorates={governorateOptions}
            />

            {/* The export needs ONE concrete status — `all` has no meaning for
                a spreadsheet handed to a shipping company, so the button reads
                the SAME tab that is open rather than a hidden default the
                admin cannot see. */}
            {status !== 'all' ? (
              <ExportRange
                status={status}
                tabLabel={TAB_LABEL[status]}
                /* Exactly the rows that render a checkbox below — anything else
                   would let the button select a row the batch can only skip. */
                selectable={rows
                  .filter((row) => row.status === 'paid' || row.status === 'shipped')
                  .map((row) => ({ id: row.id, createdAt: row.createdAt }))}
              />
            ) : null}
          </div>
        </div>

      {query && rowCount > 0 ? (
        <p className="mt-4 text-[length:var(--fs-text-sm)] text-fg-muted" role="status">
          {rowCount > rows.length
            ? formatCopy(c.searchResultsCapped, { shown: rows.length, n: rowCount })
            : formatCopy(c.searchResults, { n: rowCount })}
        </p>
      ) : null}

      {rowCount === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
          {/* A search that found nothing is not an empty queue, and saying
              «مفيش طلبات» for it reads as "the orders are gone". */}
          <p className="text-[length:var(--fs-title-4)] font-medium text-fg">
            {query ? formatCopy(c.searchEmpty, { q: query }) : c.empty}
          </p>
          <p className="mx-auto mt-2 max-w-[34rem] text-[length:var(--fs-text-sm)] text-fg-muted">
            {query ? c.searchEmptyHint : c.emptyHint}
          </p>
          {/* The order is most often one tab away — it shipped. */}
          {query && status !== 'all' ? (
            <Link
              href={`/admin/books?status=all&q=${encodeURIComponent(query)}`}
              className="mt-4 inline-block rounded-full border border-line px-4 py-2 text-[length:var(--fs-text-sm)] text-fg-muted transition-colors duration-[160ms] ease-out hover:border-accent/40 hover:text-fg"
            >
              {c.searchEmptyAll}
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="mt-5 flex flex-col gap-2.5">
          {rows.map((row) => (
            <li
              key={row.id}
              /* A hidden row looks hidden. Only reachable from «المحذوفة», but
                 an admin who got there from a search should not have to read
                 the badge to notice which of these rows is not really in the
                 list any more. */
              className={cn(
                'flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start sm:justify-between',
                row.deletedAt
                  ? 'border-dashed border-[color-mix(in_oklch,var(--err),transparent_55%)] bg-surface-2/60'
                  : 'border-line bg-surface-2',
              )}
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
                  {/* «أعرف إن الراجل ده طلب كتاب قبل كده ولا لأ» — counted on
                      the PHONE, because guest checkout means the same person is
                      several unlinked rows and the number is the only thing all
                      of them share. Coloured, not another grey pill: it is the
                      one chip on the row that changes how you treat the call. */}
                  {row.previousOrdersFromPhone > 0 ? (
                    <span className="rounded-full border border-accent/50 bg-accent/10 px-2 py-0.5 text-[length:var(--fs-text-xs)] font-medium text-accent-text">
                      {formatCopy(c.repeatCustomer, { n: row.previousOrdersFromPhone })}
                    </span>
                  ) : null}
                  {/* The status chip beside it still says «مدفوعة» — that is the
                      point of a soft delete: the row keeps the state it was
                      hidden IN. */}
                  {row.deletedAt ? (
                    <span className="rounded-full border border-[color:var(--err)] px-2 py-0.5 text-[length:var(--fs-text-xs)] font-medium text-[color:var(--err)]">
                      {c.removedBadge}
                    </span>
                  ) : null}
                </div>

                {/* «بشوف الكتب اللي الناس طالباها وما بيبقاش مكتوب عام ولا لغات».
                    The chip is PER LINE, not per order: one delivery can hold a
                    لغات book and a عام one, and the person packing the box needs
                    to know which is which. `bookLineStream` is the fallback
                    chain — the line's own pair, then the order's course, then
                    nothing at all. */}
                <ul className="mt-1 flex flex-col gap-1 text-[length:var(--fs-text-sm)] text-fg">
                  {row.items.map((item, index) => {
                    const stream = bookLineStream(item, row);
                    return (
                      <li
                        key={`${item.bookId ?? 'custom'}-${index}`}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <span>
                          {formatCopy(c.itemLine, {
                            title: item.titleAr,
                            quantity: item.quantity,
                            amount: formatEGP(item.unitPriceCents * item.quantity),
                          })}
                        </span>
                        {stream ? (
                          <StreamBadge
                            forGeneral={stream.forGeneral}
                            forLanguages={stream.forLanguages}
                          />
                        ) : null}
                        {/* الصف, beside the stream — «تبقى مكتوبة كده في جنب».
                            The LINE's own year first, falling back to the
                            order's course: a cart order has no course at all,
                            which is why the course field alone was blank on
                            nearly every row. `null` renders nothing rather
                            than «مش محدد» — an unknown year is not worth a
                            chip on a row that already carries five. */}
                        {(() => {
                          const year = item.year ?? row.courseYear;
                          return year != null && year >= 1 && year <= 3 ? (
                            <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                              {YEAR_LABEL[year - 1]}
                            </span>
                          ) : null;
                        })()}
                      </li>
                    );
                  })}
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

                {/* The two reasons, and they are not the same kind of thing.
                    The rejection is what the STUDENT was told, word for word —
                    an admin answering «ليه اترفض طلبي؟» on the phone must be
                    able to read back exactly what was sent. The deletion reason
                    is internal and nobody outside this screen has ever seen it. */}
                {row.rejectionReason ? (
                  <p className="mt-2 rounded-sm border border-[color-mix(in_oklch,var(--err),transparent_60%)] bg-[color-mix(in_oklch,var(--err),transparent_92%)] px-3 py-2 text-[length:var(--fs-text-sm)] text-fg">
                    <span className="font-medium text-[color:var(--err)]">
                      {c.rejectedReasonLabel}:{' '}
                    </span>
                    {row.rejectionReason}
                  </p>
                ) : null}
                {row.deletionReason ? (
                  <p className="mt-2 rounded-sm border border-line-subtle bg-surface-3 px-3 py-2 text-[length:var(--fs-text-sm)] text-fg-muted">
                    <span className="font-medium text-fg">{c.removedReasonLabel}: </span>
                    {row.deletionReason}
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

              {/*
                * Real, labelled buttons — one per thing an admin can do to this
                * row, in the order the work flows: fix it, ship it, confirm it
                * arrived, turn it down, hide it. Not an icon-only overflow
                * menu: this screen is used with a phone against one ear, and a
                * kebab that hides «وصل» behind a click is a kebab that gets
                * pressed wrong.
                *
                * `flex-wrap`, because five labelled buttons do not fit beside
                * an address on a laptop.
                */}
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
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

                {row.deletedAt ? (
                  /* A hidden row has exactly one thing you can do to it. Editing
                     or shipping something that is not in any working list is an
                     action whose result nobody would see. */
                  <RestoreOrderAction id={row.id} />
                ) : (
                  <>
                    {/* «أعدل» first because it is the one that is reversible. */}
                    <EditBookOrderDialog
                      order={row}
                      books={books}
                      governorates={governorateOptions}
                    />
                    {/* Only on rows a batch can act on — a checkbox on a
                        delivered order is a control whose only possible
                        outcome is «اتشحن قبل كده». */}
                    {row.status === 'paid' || row.status === 'shipped' ? (
                      <OrderCheckbox id={row.id} label={row.fullName} />
                    ) : null}
                    {row.status === 'paid' ? <ShipAction id={row.id} /> : null}
                    {/* On `paid` as well as `shipped`: Ayman delivers some of
                        these himself, and those never pass through «اتشحن». */}
                    {row.status === 'paid' || row.status === 'shipped' ? (
                      <DeliverAction id={row.id} />
                    ) : null}
                    {/* Not on a delivered order — a book in the student's hands
                        cannot be turned down — and not on one already rejected. */}
                    {row.status !== 'delivered' && row.status !== 'rejected' ? (
                      <RejectOrderAction id={row.id} />
                    ) : null}
                    <RemoveOrderAction id={row.id} />
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {/* The page had none, so only the OLDEST fifty rows of a tab could ever
          be reached — the newest order was the one guaranteed to be invisible.
          See `ListPager`. */}
      <ListPager
        page={page}
        perPage={PER_PAGE}
        rowCount={rowCount}
        labels={{ previous: c.pagerPrevious, next: c.pagerNext, of: c.pagerOf }}
      />
      </BulkShipProvider>
    </>
  );
}
