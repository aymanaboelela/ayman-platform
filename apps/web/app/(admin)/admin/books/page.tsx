import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEntitlements } from '@/lib/entitlements';
import { z } from 'zod';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import {
  AdminBookOrderFilterSchema,
  AdminBookOrderListSchema,
  AdminBookOrderOverviewSchema,
  bookOrderYearWord,
  type AdminBookOrderFilter,
  type AdminBookOrderRow,
} from '@ayman/contracts/admin/book-orders';
import {
  AdminBookOrderSortSchema,
  AdminBookOrderStreamSchema,
} from '@ayman/contracts/admin/book-orders';
import { AdminBookRowSchema } from '@ayman/contracts/admin/books';
import { cn } from '@ayman/ui';
import { getTaxonomyOrNull } from '@/lib/taxonomy';
import { adminGet } from '@/lib/admin-api';
import { BulkShipProvider, BulkToolbarActions } from './bulk-ship';
import { ExportRange } from './export-range';
import { CreateBookOrderDialog } from './create-book-order-dialog';
import { BooksTabs } from './books-tabs';
import { BookOrderCard } from './order-card';
import { BookOrderOverview } from './order-overview';
import { ListControl, ListPager } from '@/components/admin/list-controls';

const c = copy.admin.books;

/** Fifty was already the page size; what was missing was a way to reach page
 *  two. See `ListPager`. */
const PER_PAGE = 50;

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

/** Each tab's own label. `Record<Tab, …>` on purpose: a filter added to the
 *  contract is a compile error here rather than a tab nobody rendered. */
const TAB_LABEL: Record<Tab, string> = {
  paid: c.filterPaid,
  printing: c.filterPrinting,
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
 * now. «في المطبعة» directly after it, because that is literally the next thing
 * that happens to a row in it: «أنزّل PDF، أوديه للمطبعة، أضغط الطباعة». Then
 * the two states that follow one out of the door. «بدأت ومكملتش» sits after
 * those rather than second: it is a list to chase, not a list to pack. «مرفوضة»
 * and «المحذوفة» are archives, and «المحذوفة» is last because it is the only
 * tab whose rows are hidden from every other screen.
 */
const TABS: Tab[] = [
  'paid',
  'printing',
  'shipped',
  'delivered',
  'address_only',
  'rejected',
  'all',
  'deleted',
];

/**
 * Which صف an order is FILED UNDER in the split view.
 *
 * The LOWEST year it touches, and one order is rendered exactly once. The
 * alternative — rendering a mixed basket in both columns — gives one order two
 * checkboxes, two «اتشحن» buttons and two rows in a count the admin is reading
 * to decide a print run, which is worse than filing it under one and SAYING
 * that it spans two (`multiYear` on the card).
 *
 * `null` is «من غير صف» and sorts last: a hand-typed «ملزمة مراجعة» has no year
 * and filing it under أولى would invent one on the screen a run is ordered
 * from.
 */
function orderYears(row: AdminBookOrderRow): number[] {
  const years = row.items
    .map((item) => item.year ?? row.courseYear)
    .filter((year): year is number => year != null && year >= 1 && year <= 3);
  /* The course's own year is the fallback for an order with NO lines at all —
     rare, real (a hand-edited order whose last line was removed), and it must
     still land in a column rather than vanishing from the split. */
  if (years.length === 0 && row.courseYear != null) return [row.courseYear];
  return [...new Set(years)].sort((a, b) => a - b);
}

/**
 * `/admin/books` — الكتاب الورقي, the shipping queue.
 *
 * Same server-component + `adminGet` (uncached) shape as `/admin/payments`
 * and `/admin/finance`. `paid` (paid, not yet shipped) is the default tab: it
 * is the one an admin checks daily. `address_only` (started, never finished
 * paying) stays on its own tab, never merged into the same list.
 *
 * ## The صف split
 *
 * «هنضيف سنة أولى دلوقتي، ومش عايز ألخبطها بتانية — يبقى جزء يمين وجزء شمال.»
 *
 * With «كل الصفوف» selected the list renders as one SECTION per صف, side by
 * side from `lg` up, each with its own counts and its own «تحميل PDF» / «كروت
 * الشحن» for that year alone. Picking a specific صف from the dropdown collapses
 * it back to one list — the whole screen is already that year, and splitting it
 * again would be a column with a heading and nothing beside it.
 *
 * ⚠️ The section HEADINGS count the whole filtered tab (from `/overview`); the
 * cards under them are this page's fifty. Those are different quantities on
 * purpose and the heading says which it is — a heading that counted the page
 * would disagree with the pager, the sidebar badge and the export in one go.
 */
export default async function AdminBooksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /*
   * القسم ده مش موجود على ستاك الفيتشر دي مقفولة فيه — والصف بتاعه في
   * `ADMIN_NAV` مش بيترسم أصلًا. ده الباب لو حد كتب الـURL بإيده.
   *
   * `notFound()` مش ٤٠٣: الصفحة مش «ممنوعة»، هي مش هنا. ونفس الشكل بالحرف
   * اللي `(admin)/layout.tsx` بيستخدمه، وبيشرح ليه فوقه.
   */
  if (!(await getEntitlements()).books) notFound();

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

  /* The header's own query — the SAME filters, minus the paging, because it
     describes the tab rather than the page. `perPage` still has to be a legal
     `PAGE_SIZES` value for `ListQuerySchema`; the endpoint ignores it. */
  const overviewQuery = new URLSearchParams(listQuery);
  overviewQuery.delete('page');
  overviewQuery.delete('perPage');

  const [{ rows, rowCount }, overview, taxonomy, books] = await Promise.all([
    adminGet(`/api/admin/book-orders?${listQuery}`, AdminBookOrderListSchema),
    adminGet(`/api/admin/book-orders/overview?${overviewQuery}`, AdminBookOrderOverviewSchema),
    /* ⚠️ `getTaxonomyOrNull()`, not `apiGet('/api/taxonomy', …)`. The throwing
       uncached read is what 500'd `/admin/students` for seven minutes after a
       deploy on 2026-09-04: `apiGet` forwards no cookie, so every server-side
       taxonomy read in the fleet shares one rate-limit identity, and a cold
       cache after a container restart empties that bucket. Here the data only
       labels a select, so `null` costs an empty dropdown rather than the
       screen. */
    getTaxonomyOrNull(),
    /* The catalogue — for «أعدل الطلب»'s «ضيف كتاب» picker AND for «أضف طلب
       كتاب»'s own list. Fetched on the ORDERS page because that is where both
       dialogs live; a client component cannot read it without a per-row
       request.

       ⚠️ `/api/admin/courses` is deliberately NOT fetched here. The create
       dialog used to build its list from courses carrying the legacy
       `bookTitle`/`bookPriceCents` pair. That pair is not the source of truth
       now: `books` is, a book can belong to no course at all, and a course's
       own textbook is a catalogue row with `courseId` set. */
    adminGet('/api/admin/books', z.array(AdminBookRowSchema)),
  ]);

  const governorateOptions = (taxonomy?.governorates ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  /*
   * ── The صف split, computed once ───────────────────────────────────────
   *
   * Only when the year dropdown is on «كل الصفوف»: with a year chosen the whole
   * screen is that year already. Sections come from the OVERVIEW's years (so a
   * صف with rows on page two still gets a heading, with its own downloads) and
   * each is filled from this page's rows.
   */
  const splitByYear = year === undefined && rowCount > 0;
  const yearOf = new Map(rows.map((row) => [row.id, orderYears(row)]));
  const sections = splitByYear
    ? overview.years.map((entry) => ({
        year: entry.year,
        counts: entry,
        rows: rows.filter((row) => {
          const years = yearOf.get(row.id) ?? [];
          return entry.year === null ? years.length === 0 : years[0] === entry.year;
        }),
      }))
    : [];

  /** One list of cards — used by both layouts, so the two cannot drift. */
  const cardsFor = (list: AdminBookOrderRow[]) => (
    <ul className="flex flex-col gap-3">
      {list.map((row) => (
        <BookOrderCard
          key={row.id}
          row={row}
          books={books}
          governorates={governorateOptions}
          multiYear={(yearOf.get(row.id) ?? []).length > 1}
        />
      ))}
    </ul>
  );

  return (
    <>
      <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
        {c.eyebrow}
      </p>
      <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
      <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.subtitle}</p>

      <BooksTabs active="/admin/books" />

      {/* الأرقام أول حاجة — «محتاجها فوق، في أول صفحة كده». Above the filters
          rather than under them, because it is what the screen is opened to
          read before anything is pressed. */}
      <BookOrderOverview overview={overview} />

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
                أولى أو تانية». Three dropdowns rather than three more rows of
                chips; see `ListControl`. */}
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
                  label: formatCopy(c.yearOption, { year: bookOrderYearWord(n) ?? '' }),
                })),
              ]}
            />
            <CreateBookOrderDialog
              /* Active titles only — an order for a book that is off the shelf
                 is an order the shop has said it is not taking. `courseTitle`
                 rides along as a LABEL, so «كتاب الترم الأول» under three
                 different courses is three distinguishable options. */
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
                /* The three filters the toolbar above is showing. Without them
                   the file is a different set of orders than the list —
                   «جالب إن واحد ناقص» — and nobody can tell which is right. */
                filters={{ stream, year, q: query || undefined }}
                /* The TAB's total, not this page's fifty. See `ExportRange`. */
                rowCount={rowCount}
                /* The three states a parcel can still be moved out of. */
                batchable={
                  status === 'paid' || status === 'printing' || status === 'shipped'
                }
              />
            ) : null}
          </div>
        </div>

        {/*
          The batch actions, HERE as well as in the sticky bar at the foot of
          the list. «حدّد الكل» is pressed in the row above this one, and the
          only thing that answered it used to be pinned to the far edge of a
          fifty-three-row screen — so «اشحن المحدد» read as missing. It renders
          nothing while nothing is selected. See `BulkActions`.
        */}
        <BulkToolbarActions />

        {query && rowCount > 0 ? (
          <p className="mt-4 text-[length:var(--fs-text-sm)] text-fg-muted" role="status">
            {rowCount > rows.length
              ? formatCopy(c.searchResultsCapped, { shown: rows.length, n: rowCount })
              : formatCopy(c.searchResults, { n: rowCount })}
          </p>
        ) : null}

        {rowCount === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
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
        ) : splitByYear ? (
          /* ── سنة أولى | سنة تانية ─────────────────────────────────────
             `lg` and not `md`: inside the admin shell `md` is a ~336px column
             (see the rail note in the layout), and two columns of order cards
             at that width is two unreadable columns. One per row until there is
             genuinely room for two. */
          <div
            className={cn(
              'mt-5 grid items-start gap-4',
              /* Two columns only when there is genuinely something to compare.
                 A tab holding one صف — «في المطبعة» most mornings — rendered as
                 a half-width column beside an empty half, which reads as a
                 second section that failed to load. */
              sections.length > 1 ? 'lg:grid-cols-2' : '',
            )}
          >
            {sections.map((section) => (
              <section key={section.year ?? 'none'} className="min-w-0">
                <header className="sticky top-0 z-10 -mx-1 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface-1/95 px-3 py-2 backdrop-blur">
                  <h2 className="text-[length:var(--fs-title-4)] font-semibold text-fg">
                    {section.year === null
                      ? c.yearSectionNone
                      : formatCopy(c.yearSectionTitle, {
                          year: bookOrderYearWord(section.year) ?? '',
                        })}
                  </h2>
                  <p className="text-[length:var(--fs-text-xs)] tabular-nums text-fg-muted">
                    {formatCopy(c.yearSectionCount, {
                      orders: section.counts.orders,
                      books: section.counts.books,
                      copies: section.counts.copies,
                    })}
                    {' · '}
                    {formatCopy(c.yearSectionStreams, {
                      general: section.counts.streams.general,
                      languages: section.counts.streams.languages,
                    })}
                  </p>

                  {/*
                    «أقدر أحمّل PDF بتاع سنة أولى لوحده» — the downloads for
                    THIS صف, scoped by adding `year` to the same query the
                    toolbar's own export uses.

                    ⚠️ `year: null` («من غير صف») gets none: there is no
                    `year` value that selects it, so a button here would
                    silently hand over the whole tab. Those orders are still in
                    the tab-wide export above, which is the honest place for
                    them.
                  */}
                  {section.year !== null && status !== 'all' ? (
                    <span className="ms-auto">
                      <ExportRange
                        status={status}
                        tabLabel={
                          formatCopy(c.yearSectionTitle, {
                            year: bookOrderYearWord(section.year) ?? '',
                          })
                        }
                        filters={{ stream, year: section.year, q: query || undefined }}
                        rowCount={section.counts.orders}
                        batchable={
                          status === 'paid' || status === 'printing' || status === 'shipped'
                        }
                        compact
                      />
                    </span>
                  ) : null}
                </header>

                {section.rows.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line bg-surface-2 px-4 py-8 text-center text-[length:var(--fs-text-sm)] text-fg-muted">
                    {/* Two different sentences: a صف with orders elsewhere in
                        the tab is not a صف with no orders, and telling the
                        admin the second when the first is true sends them
                        looking for a bug. */}
                    {section.counts.orders > 0 ? c.yearSectionEmptyPage : c.yearSectionEmpty}
                  </p>
                ) : (
                  cardsFor(section.rows)
                )}
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-5">{cardsFor(rows)}</div>
        )}

        {/* The page had none, so only the OLDEST fifty rows of a tab could ever
            be reached — the newest order was the one guaranteed to be
            invisible. See `ListPager`. */}
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
