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
 * The flat delivery fee, in piastres — 65 EGP.
 *
 * A DEFAULT, not the law: `SiteSettings.store.shippingCents` is what the
 * catalogue reports and what checkout charges, so the price can move without a
 * deploy. This constant is what that setting falls back to on a settings row
 * written before it existed, and it is the one place the number is written.
 */
export const BOOK_SHIPPING_CENTS = 6_500;

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
 * `shippingCents` rides along rather than being read from public settings, for
 * two reasons: the cart needs it on the very first render (a total that appears
 * a beat after the books did looks like a bug), and it keeps the fee out of
 * `PublicSettingsSchema`, which every page on the site parses — adding a
 * required key there is a change with a blast radius this does not need.
 */
export const BookCatalogSchema = z.object({
  shelves: z.array(BookShelfSchema),
  shippingCents: z.number().int().min(0),
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
