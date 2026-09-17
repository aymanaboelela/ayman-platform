import { z } from '@ayman/contracts/zod';

/**
 * «الكتب» — the printed-book shop: a catalogue a visitor browses, a cart they
 * fill, and one order that ships to one address.
 *
 * ## Why this exists next to `book-orders.ts` rather than replacing it
 *
 * `book-orders.ts` already models an ORDER — the address form, the Vodafone
 * Cash step, the shipping state — and every one of those parts is unchanged
 * here. What it did not model is a BOOK: an order was pinned to a COURSE, and
 * the only thing on sale was `Course.bookTitle` at `Course.bookPriceCents`.
 * That made three things unrepresentable, and all three were asked for:
 *
 *   · A book with no course behind it — a revision booklet, a past-papers
 *     collection, a second-term volume for a subject whose course is still
 *     being recorded.
 *   · More than one book in one order. «واحد سنة أولى، واحد سنة ٢» is one
 *     delivery to one address, not two orders that happen to share a street.
 *   · A quantity. Two copies of one book is `quantity: 2`, never two rows, or
 *     the price the cart showed stops matching the price the order stored.
 *
 * So this module adds the CATALOGUE and the CART. The order they produce is
 * the same `BookOrder` row, with lines on it.
 *
 * ## Shipping is charged once, per ORDER
 *
 * «مش منطقي إن يشتري ٢ ويدفع شحن مرتين». One courier trip carries the whole
 * order, so the fee is added once to the total no matter how many books or how
 * many copies are in it — which is why it is a field on the order and never on
 * a line. `BOOK_SHIPPING_CENTS` is only the DEFAULT: the live value comes from
 * site settings, and the amount actually charged is frozen onto each order when
 * it is placed, so raising the fee never rewrites what an old order says it
 * cost.
 *
 * No relative imports — same rule as every other leaf module in this package.
 */

/**
 * Which half of the school year a book covers.
 *
 * `full` is a real third value and not "both terms": a single-volume book for
 * the whole year is one object with one price and one cover, and modelling it
 * as a pair would let a student buy the same book twice. The catalogue groups
 * on this, so it is also the section heading a reader sees.
 */
export const BookTermSchema = z.enum(['first', 'second', 'full']);
export type BookTerm = z.infer<typeof BookTermSchema>;

/**
 * ⚠️ LEGACY — the old FLAT delivery fee, 65 EGP, charged to every address in
 * Egypt.
 *
 * It is not what checkout quotes any more: delivery is priced per ZONE now (see
 * `BookShippingRatesSchema` below). The constant survives because
 * `StoreSettings.shippingCents` survives — a settings row already written on
 * production carries that key, `StoreSettingsSchema` is `.strict()`, and
 * deleting the field would make every settings read throw on the live row. It
 * is parsed and ignored.
 *
 * Nothing new should read it. `bookShippingCentsFor()` is the answer to «الشحن
 * كام».
 */
export const BOOK_SHIPPING_CENTS = 6_500;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * الشحن بقى على حسب المحافظة.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * «قاهرة وجيزة ٨٠، وجه بحري ١٠٠، صعيد وسينا وبحر أحمر ١٥٠.»
 *
 * Three zones, because that is how the courier actually prices the country and
 * how the owner quoted it. One flat fee was wrong in both directions at once:
 * it over-charged the two cities that get same-week delivery and under-charged
 * every address the courier has to drive a day to reach.
 *
 * ## Still charged ONCE per order
 *
 * Unchanged and load-bearing — «لو حد طلب أكتر من كتاب هيبقى نفس الشحن، متزودش
 * شحن». One courier trip carries the whole basket, so the fee is a field on the
 * ORDER and never on a line, and `bookOrderTotals` adds it exactly once. Making
 * it depend on the address changes WHICH number is added, not how many times.
 *
 * ## Keyed on the CODE, never on `governorates.region`
 *
 * The same trap `deliveryDaysFor` documents, and it bites harder here because
 * this one moves money. Egypt's official classification files الجيزة under
 * `upper` and الإسكندرية under `urban`: a region test would put Giza — half of
 * Cairo, and the cheapest address the courier has — in the 150 EGP tier, and it
 * would leave الإسكندرية and بورسعيد in a tier with القاهرة. Both are wrong on
 * the rows that occur most.
 *
 * ## The unknown case charges the MOST, and is unreachable
 *
 * `book_orders.governorate_code` is `NOT NULL` with a foreign key, and the
 * checkout form makes the field required, so no real order reaches the
 * fallback. If one ever does, the address is somewhere this table does not
 * describe — which is not an address the cheap tier was written for. A default
 * that under-charges is a default that silently eats the difference on exactly
 * the deliveries that cost most.
 */
export const BookShippingZoneSchema = z.enum(['cairo_giza', 'delta', 'far']);
export type BookShippingZone = z.infer<typeof BookShippingZoneSchema>;

/**
 * Which governorate codes sit in which zone.
 *
 * `far` is deliberately NOT listed: it is everything else, so a governorate
 * added to the taxonomy later lands in the tier that cannot under-charge rather
 * than silently joining القاهرة. مطروح and الوادي الجديد are in it for the same
 * reason — he named صعيد, سينا and البحر الأحمر, and those two are further from
 * a depot than any of them.
 */
const SHIPPING_ZONE_CODES: Readonly<Record<'cairo_giza' | 'delta', ReadonlySet<string>>> = {
  /** القاهرة, الجيزة. */
  cairo_giza: new Set(['01', '21']),
  /**
   * وجه بحري — the Delta proper plus the canal and coastal cities that are
   * reached on the same runs: الإسكندرية، بورسعيد، السويس، الإسماعيلية.
   */
  delta: new Set(['02', '03', '04', '11', '12', '13', '14', '15', '16', '17', '18', '19']),
};

export function bookShippingZoneOf(governorateCode: string | null | undefined): BookShippingZone {
  if (!governorateCode) return 'far';
  if (SHIPPING_ZONE_CODES.cairo_giza.has(governorateCode)) return 'cairo_giza';
  if (SHIPPING_ZONE_CODES.delta.has(governorateCode)) return 'delta';
  return 'far';
}

/**
 * The three prices, in piastres — editable from `/admin/books/catalog` so the
 * courier raising his rate is a form field rather than a deploy, exactly the
 * argument the single fee was a setting for.
 *
 * Every zone has a `.default()`, so a settings row written before this existed
 * reads as the three numbers he quoted rather than as zero — and a zero fee
 * would be a real shipment quoted free.
 */
export const BookShippingRatesSchema = z.object({
  cairo_giza: z.number().int().min(0).max(50_000).default(8_000),
  delta: z.number().int().min(0).max(50_000).default(10_000),
  far: z.number().int().min(0).max(50_000).default(15_000),
});
export type BookShippingRates = z.infer<typeof BookShippingRatesSchema>;

/** The quoted numbers, as the one place they are written down. */
export const DEFAULT_BOOK_SHIPPING_RATES: BookShippingRates = {
  cairo_giza: 8_000,
  delta: 10_000,
  far: 15_000,
};

/**
 * «الشحن كام» — THE answer, for the cart, the checkout, the API and the admin
 * editor.
 *
 * A function over (address, rates) and not a lookup at render time on either
 * side: the amount actually charged is still frozen onto
 * `book_orders.shipping_cents` when the order is placed, so raising a rate
 * never rewrites what an old order says it cost.
 */
export function bookShippingCentsFor(
  governorateCode: string | null | undefined,
  rates: BookShippingRates,
): number {
  return rates[bookShippingZoneOf(governorateCode)];
}

/** The cheapest zone — what «الشحن يبدأ من ٨٠ ج» quotes on a page that has not
 *  been told an address yet. Derived, never a fourth stored number. */
export function minBookShippingCents(rates: BookShippingRates): number {
  return Math.min(rates.cairo_giza, rates.delta, rates.far);
}

/**
 * The most copies of one book a single order may ask for.
 *
 * Not a stock rule — stock is per-book and separate. This is the ceiling that
 * keeps a typo (or a script) from turning one order into a print run, and it
 * lives in the contract so the cart and the API cannot disagree about it.
 */
export const MAX_BOOK_QUANTITY = 20;

/** How many distinct titles may sit in one cart. Same reasoning as above. */
export const MAX_CART_LINES = 20;

/** One book, as a card on `/books` shows it. */
export const BookCardSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  titleAr: z.string(),
  /** The one line under the title — «شرح + أسئلة + نماذج امتحانات». */
  subtitleAr: z.string().nullable(),
  /**
   * The storage KEY, never a full URL — the same rule `CatalogCourse.coverKey`
   * follows, and for the same reason: moving to S3/R2 changes one env var
   * rather than every row that was ever serialised. The web resolves it through
   * `mediaUrl()`. `null` while no cover has been uploaded, which on day one is
   * every book — the card has a designed fallback rather than a broken image.
   */
  coverKey: z.string().nullable(),
  descriptionAr: z.string().nullable(),
  priceCents: z.number().int().min(0),
  /**
   * The struck-through "before" price. `null` is the normal case; when set it
   * is always strictly above `priceCents`, which the database enforces — a
   * "discount" to a higher number is a lie a CHECK constraint can prevent.
   */
  comparePriceCents: z.number().int().min(0).nullable(),
  pageCount: z.number().int().min(1).nullable(),
  term: BookTermSchema,
  /** The school year this book is for — a label, never a filter. See below. */
  year: z.number().int().min(1).max(3).nullable(),
  /**
   * `false` when `stock` has reached zero. The card still renders — a book
   * that vanishes reads as a broken page — but it cannot be added to a cart.
   */
  inStock: z.boolean(),
  /**
   * عام ولا لغات — the same pair `CatalogCourse` carries, rendered by the same
   * `<StreamBadge>`. A label on the card, never a filter on the list: the shop
   * shows every visitor every book for exactly the reason `year` above is not a
   * filter either, and a student who cannot tell the لغات edition from the عام
   * one is the person this chip exists for.
   */
  forGeneral: z.boolean(),
  forLanguages: z.boolean(),
  /**
   * Whether the landing page's «قسم الكتب» strip may show this book.
   *
   * It rides on the card rather than being a second endpoint because
   * `<BooksStrip>` and `/books` read ONE cached catalogue between them
   * (`getBookCatalogOrEmpty`, one `'use cache'` on one tag); a placement-filtered
   * variant would double the fetch and let the two disagree for a cache window.
   * The strip filters on this; the shop ignores it.
   */
  showOnLanding: z.boolean(),
});
export type BookCard = z.infer<typeof BookCardSchema>;

/**
 * One subject's shelf: its books, split by term.
 *
 * ⚠️ A subject with NO books is never in this list. «لو المادة مفيش ليها كتاب
 * مش هضيفه» — an empty shelf under a subject heading reads as a page that
 * failed to load rather than an honest "nothing here yet", and there is no
 * action a reader could take on it.
 *
 * The year is deliberately NOT a filter on this list. Every visitor sees every
 * subject, exactly as the course catalogue works — a first-year student buying
 * next year's book early is a sale, not a mistake to prevent, and the year
 * label on each card is what tells them which is which.
 */
export const BookShelfSchema = z.object({
  /** `null` for the «كتب عامة» shelf — books that belong to no one subject. */
  subjectId: z.uuid().nullable(),
  subjectNameAr: z.string(),
  subjectSlug: z.string().nullable(),
  first: z.array(BookCardSchema),
  second: z.array(BookCardSchema),
  full: z.array(BookCardSchema),
});
export type BookShelf = z.infer<typeof BookShelfSchema>;

/**
 * `GET /api/books` — the whole shop in one payload.
 *
 * The delivery rates ride along rather than being read from public settings,
 * for two reasons: the cart needs them on the very first render (a total that
 * appears a beat after the books did looks like a bug), and it keeps them out
 * of `PublicSettingsSchema`, which every page on the site parses — adding a
 * required key there is a change with a blast radius this does not need.
 */
export const BookCatalogSchema = z.object({
  shelves: z.array(BookShelfSchema),
  /**
   * ⚠️ The CHEAPEST zone, not the fee. It is what a page that has not been told
   * an address yet may quote — «الشحن يبدأ من ٨٠ ج» — and it keeps every
   * existing reader of this field rendering a true number instead of breaking.
   *
   * Nothing may CHARGE it. The amount owed depends on the governorate and is
   * computed by `bookShippingCentsFor` from `shippingRates` below, server-side,
   * at the moment the order is written.
   */
  shippingCents: z.number().int().min(0),
  /** The three zone rates, so the cart can re-quote the total the instant the
   *  student picks a governorate rather than after a round trip. */
  shippingRates: BookShippingRatesSchema,
  total: z.number().int().min(0),
});
export type BookCatalog = z.infer<typeof BookCatalogSchema>;

/**
 * One line of a cart on its way to the server.
 *
 * The price is NOT here, and that is the rule this schema exists to enforce:
 * the server reads `books.price_cents` for every id it is given and computes
 * the total itself. A price posted from a browser is a price a browser can
 * choose — the same reason `PaymentsService.submit` derives `amountCents`
 * server-side rather than trusting the form.
 */
export const BookCartLineSchema = z
  .object({
    bookId: z.uuid(),
    quantity: z.number().int().min(1).max(MAX_BOOK_QUANTITY),
  })
  .strict();
export type BookCartLine = z.infer<typeof BookCartLineSchema>;

/**
 * The cart itself — at least one line, and never two lines for one book.
 *
 * The duplicate check is here rather than left to the server to merge: two
 * lines for one book means the cart that produced them has already lost track
 * of its own quantities, and silently adding them together would hide that
 * from whoever has to debug it.
 */
export const BookCartSchema = z
  .array(BookCartLineSchema)
  .min(1, 'لازم تختار كتاب واحد على الأقل')
  .max(MAX_CART_LINES)
  .refine((lines) => new Set(lines.map((line) => line.bookId)).size === lines.length, {
    message: 'الكتاب الواحد يتكتب مرة واحدة بالعدد المطلوب',
  });
export type BookCart = z.infer<typeof BookCartSchema>;

/** One line of a placed order, as the student's own confirmation shows it. */
export const BookOrderLineSchema = z.object({
  /** `null` once the book itself has been deleted — the title survives it. */
  bookId: z.uuid().nullable(),
  titleAr: z.string(),
  unitPriceCents: z.number().int().min(0),
  quantity: z.number().int().min(1),
  /**
   * عام ولا لغات, read LIVE off the linked book — not a snapshot like
   * `titleAr` and `unitPriceCents` beside it.
   *
   * Those two are frozen because they are what the customer AGREED TO, and a
   * later rename or reprice must not rewrite a placed order. Which school the
   * printed book is for is not a term of the sale; it is a fact about the
   * object, and if the admin corrects it the packing list should say the
   * corrected thing — the whole point of the field is that the person putting
   * books in a box reads it.
   *
   * Both `null` together when there is no book to read: a line the admin typed
   * by hand («كتاب خاص»), or one whose book row was deleted. The admin screen
   * falls back to the order's own course when it can, and prints nothing when
   * it cannot — which is honest, and is what the «عام / لغات» column did on
   * every cart order before this existed.
   */
  forGeneral: z.boolean().nullable(),
  forLanguages: z.boolean().nullable(),
  /** الصف الدراسي of the BOOK on this line. `null` for a line with no
   *  catalogue row behind it, and for a title whose year was never set —
   *  «مش محدد», never a guess. On a cart order this is the ONLY place a year
   *  can come from: such an order has no course. */
  year: z.number().int().nullable(),
});
export type BookOrderLine = z.infer<typeof BookOrderLineSchema>;

/**
 * What an order costs, broken out.
 *
 * Four numbers rather than one, on every surface that shows money, because
 * «٥٦٥ جنيه» with no breakdown is the commonest reason someone abandons a cart
 * or calls to ask whether they were overcharged. The identity
 * `total = items + shipping − discount` is enforced by a CHECK constraint, so
 * these four can never disagree with each other in the database.
 */
export const BookOrderTotalsSchema = z.object({
  itemsCents: z.number().int().min(0),
  shippingCents: z.number().int().min(0),
  discountCents: z.number().int().min(0),
  totalCents: z.number().int().min(0),
});
export type BookOrderTotals = z.infer<typeof BookOrderTotalsSchema>;

/**
 * The arithmetic, in ONE place — used by the cart, the checkout summary, the
 * API and the admin order editor.
 *
 * A function rather than four repeated expressions because the shipping rule is
 * the part that is easy to get wrong: it is added ONCE, and only when there is
 * something to ship. An empty cart is 0 and not 65 — quoting a delivery fee for
 * nothing is how a cart that failed to load starts asking for money.
 */
export function bookOrderTotals(
  lines: readonly { unitPriceCents: number; quantity: number }[],
  shippingCents: number,
  discountCents = 0,
): BookOrderTotals {
  const itemsCents = lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
  const shipping = lines.length === 0 ? 0 : shippingCents;
  /* Clamped rather than rejected: a discount larger than the order is an admin
     typo, and the database's own CHECK would turn it into a 500 on save. The
     editor renders the clamped number back, which is the correction. */
  const discount = Math.min(Math.max(discountCents, 0), itemsCents + shipping);
  return {
    itemsCents,
    shippingCents: shipping,
    discountCents: discount,
    totalCents: itemsCents + shipping - discount,
  };
}
