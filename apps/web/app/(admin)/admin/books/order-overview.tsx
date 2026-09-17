import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import type { AdminBookOrderOverview } from '@ayman/contracts/admin/book-orders';
import { bookOrderYearWord } from '@ayman/contracts/admin/book-orders';
import { cn } from '@ayman/ui';

const c = copy.admin.books;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * الأرقام فوق الشاشة — «كام نسخة، كام كتاب، كام طالب، كام عربي، كام لغات».
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * «كروت الشحن دي أنا محتاج فوق برضه، في أول صفحة كده، تظبطلي تقولي العدد مكتوب
 *  إيه، كام نسخة، وكام كتاب، وكام طالب، وكام كتاب عربي وكام كتاب لغات.»
 *
 * ## Why every number is a request and not a `rows.length`
 *
 * The list under this is fifty per page. Counting what is rendered answers a
 * question about the page, and this header is opened to answer a question about
 * the TAB. It is the same mistake «حدّد اللي في المدى» made when it ticked fifty
 * of fifty-two and a batch «اتشحن» quietly left two parcels behind — except a
 * header has no button to press, so the number would simply be wrong with
 * nothing on screen saying so. See `BookOrdersService.adminOverview`.
 *
 * ## Why «طالب» and «طلب» are both here
 *
 * They are different, and the difference is the point: one person ordering
 * three times is three parcels and one phone call. Neither number is derivable
 * from the other on this screen.
 *
 * ## Why عربي + لغات may exceed «نسخة»
 *
 * A book flagged for both streams is genuinely on sale to both and is counted
 * in both. The note under the year row says the equivalent about years out
 * loud; for the streams the two figures sit side by side under «نسخة» and are
 * read as answers to «كام عربي؟» / «كام لغات؟», never as a split of it.
 */

function Stat({
  value,
  label,
  tone,
  wide = false,
}: {
  value: number;
  label: string;
  /** A CSS colour for the number and the card's tint, or nothing for the
   *  neutral cards. Only the two that are ACTED on wear one — a row of six
   *  coloured tiles is a row of six things shouting, which is the same as
   *  none. */
  tone?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-line bg-surface-2 px-4 py-3',
        wide ? 'col-span-2 sm:col-span-1' : '',
      )}
      style={
        tone
          ? {
              borderColor: `color-mix(in oklch, ${tone}, transparent 70%)`,
              background: `color-mix(in oklch, ${tone}, transparent 94%)`,
            }
          : undefined
      }
    >
      <p
        className="text-[length:var(--fs-title-2)] font-semibold leading-none tabular-nums text-fg"
        style={tone ? { color: tone } : undefined}
      >
        {value.toLocaleString('ar-EG-u-nu-latn')}
      </p>
      <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{label}</p>
    </div>
  );
}

export function BookOrderOverview({ overview }: { overview: AdminBookOrderOverview }) {
  return (
    <section
      aria-label={c.overviewTitle}
      className="mt-4 rounded-2xl border border-line bg-surface-1 p-3 sm:p-4"
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat value={overview.orders} label={c.overviewOrders} />
        <Stat value={overview.students} label={c.overviewStudents} />
        <Stat value={overview.books} label={c.overviewBooks} />
        {/* «كام نسخة» is what to PACK and is the one number a print run is
            decided on, so it is the one that is coloured. */}
        <Stat value={overview.copies} label={c.overviewCopies} tone="var(--a-11)" />
        <Stat value={overview.streams.general} label={c.overviewGeneral} />
        <Stat value={overview.streams.languages} label={c.overviewLanguages} />
      </div>

      {/* ── The same totals, per صف ──────────────────────────────────────
          Read side by side rather than stacked: «كام سنة أولى وكام سنة تانية»
          is a COMPARISON, and two rows of numbers a scroll apart is not one. */}
      {overview.years.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {overview.years.map((year) => (
            <div
              key={year.year ?? 'none'}
              className="rounded-xl border border-line-subtle bg-surface-2 px-4 py-3"
            >
              <p className="text-[length:var(--fs-text-sm)] font-semibold text-fg">
                {year.year === null
                  ? c.yearSectionNone
                  : formatCopy(c.yearSectionTitle, { year: bookOrderYearWord(year.year) ?? '' })}
              </p>
              <p className="mt-1 text-[length:var(--fs-text-sm)] tabular-nums text-fg-muted">
                {formatCopy(c.yearSectionCount, {
                  orders: year.orders,
                  books: year.books,
                  copies: year.copies,
                })}
              </p>
              <p className="mt-0.5 text-[length:var(--fs-text-xs)] tabular-nums text-fg-faint">
                {formatCopy(c.yearSectionStreams, {
                  general: year.streams.general,
                  languages: year.streams.languages,
                })}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <p className="mt-2 text-[length:var(--fs-text-xs)] text-fg-faint">
        {c.overviewScope}
        {/* Said once, here, and never worked around by silently making the
            buckets partition: an order holding a first-year book and a
            second-year book really is one order in both, and that is the
            answer «كام طلب فيه كتاب أولى» needs. */}
        {overview.years.length > 1 ? ` — ${c.overviewYearsNote}` : ''}
      </p>
    </section>
  );
}
