import { copy } from '@ayman/contracts/copy/admin';
import type { AdminBookOrderOverview } from '@ayman/contracts/admin/book-orders';

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

function Stat({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span
        className="text-[length:var(--fs-title-4)] font-semibold leading-none tabular-nums text-fg"
        style={tone ? { color: tone } : undefined}
      >
        {value.toLocaleString('ar-EG-u-nu-latn')}
      </span>
      <span className="text-[length:var(--fs-text-xs)] text-fg-muted">{label}</span>
    </span>
  );
}

/**
 * The tab's numbers, as ONE line.
 *
 * It was six large tiles, then a box per صف, then a sentence — a full screen
 * before the first order, on the page whose job is the orders. The per-صف
 * numbers already head each صف's own column below, so here they would be said
 * twice; what is left is the six totals, read left to right in one glance.
 * «كام نسخة» stays the coloured one: it is what a print run is decided on.
 */
export function BookOrderOverview({ overview }: { overview: AdminBookOrderOverview }) {
  return (
    <section
      aria-label={c.overviewTitle}
      title={c.overviewScope}
      className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-full border border-line bg-surface-2 px-5 py-2.5"
    >
      <Stat value={overview.orders} label={c.overviewOrders} />
      <Stat value={overview.students} label={c.overviewStudents} />
      <Stat value={overview.books} label={c.overviewBooks} />
      <Stat value={overview.copies} label={c.overviewCopies} tone="var(--a-11)" />
      <span aria-hidden className="h-5 w-px bg-line" />
      <Stat value={overview.streams.general} label={c.overviewGeneral} />
      <Stat value={overview.streams.languages} label={c.overviewLanguages} />
    </section>
  );
}
