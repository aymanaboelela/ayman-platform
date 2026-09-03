import { z } from '@ayman/contracts/zod';
import { BookTermSchema, MAX_BOOK_QUANTITY, MAX_CART_LINES } from '@ayman/contracts/books';
import { partialWithoutDefaults } from '@ayman/contracts/partial';

/**
 * `/admin/books` — the shop's own screen: the catalogue on one tab, the orders
 * on the other.
 *
 * ## Two things Ayman asked for by name, and what they are here
 *
 *   · «أقدر أعدل على كل حاجة حرفيا — السعر وكده» → `AdminBookOrderPatchSchema`
 *     below rewrites an order's LINES, its shipping, its discount and its note
 *     in one PATCH. Not four endpoints: changing a quantity and waiving the
 *     delivery fee is one decision made in one conversation, and splitting it
 *     would let an order sit half-edited between two requests with its total
 *     disagreeing with its lines — a state `book_orders_amount_is_the_sum`
 *     would reject anyway, as a 500 the admin cannot act on.
 *   · «أقدر أضيف لحد كتاب وأكتب هيدفع كام وأضيف نوت» → the same PATCH adds a
 *     line, and `unitPriceCents` on that line is admin-typed rather than read
 *     from the catalogue. A price agreed on the phone is a real price, and
 *     forcing it back through `books.price_cents` would mean changing the shop
 *     for everyone to give one person a discount.
 *
 * ## Why the line price is trusted here and never on the public route
 *
 * `BookCartLineSchema` deliberately carries no price: a browser that names its
 * own price is a browser that can pay 1 EGP. This module is behind
 * `book:write`, which only an admin holds, and the whole point of the screen is
 * to record what a human agreed to. The two schemas differ because the two
 * trust levels differ — not by accident.
 */

/** One catalogue row, as the admin books table shows it. */
export const AdminBookRowSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  titleAr: z.string(),
  subtitleAr: z.string().nullable(),
  subjectId: z.uuid().nullable(),
  subjectNameAr: z.string().nullable(),
  year: z.number().int().min(1).max(3).nullable(),
  term: BookTermSchema,
  /** The course this book belongs to, when it is a course's own textbook. */
  courseId: z.uuid().nullable(),
  courseTitle: z.string().nullable(),
  priceCents: z.number().int().min(0),
  /** What ONE copy costs to make. `null` is «مش معروف» — see the column's own
   *  note: a 0 here would report the whole cover price as profit. Admin-only;
   *  it is never on `BookCard`. */
  unitCostCents: z.number().int().min(0).nullable(),
  comparePriceCents: z.number().int().min(0).nullable(),
  coverKey: z.string().nullable(),
  descriptionAr: z.string().nullable(),
  pageCount: z.number().int().min(1).nullable(),
  isActive: z.boolean(),
  /** `null` = «مش بنعد». See the model note on why that is not the same as 0. */
  stock: z.number().int().min(0).nullable(),
  sortOrder: z.number().int(),
  /** How many copies of this title have ever been ordered — the one number
   *  that makes the list worth sorting by something other than name. */
  orderedCount: z.number().int().min(0),
  updatedAt: z.iso.datetime(),
});
export type AdminBookRow = z.infer<typeof AdminBookRowSchema>;

/**
 * ⚠️ Not `z.string().min(1)`. This value becomes a URL path segment on
 * `/books/[slug]`, so the same three characters `NewsSlugSchema` excludes are
 * excluded here and for the same reasons: `/` invents a path segment, `.`
 * collides with the `.md` twin convention, and whitespace produces links nobody
 * can paste. Arabic slugs are fine and expected.
 */
export const BookSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .refine((value) => !/[/.\s]/.test(value), {
    message: 'الرابط ما ينفعش يحتوي على مسافة أو نقطة أو شرطة مائلة',
  });

/**
 * A price, in PIASTRES, capped at 100,000 EGP.
 *
 * The ceiling is not about what a book could cost; it is about the extra zero.
 * A 2,500 EGP book is a typo whose only symptom is an order nobody completes,
 * and the cap turns it into a form error instead.
 */
const priceCents = z.number().int().min(0).max(10_000_000);

/**
 * The catalogue row's editable shape, declared once as a raw shape so both the
 * create schema and the patch schema below are built from the same fields. Two
 * hand-kept copies is how one of them ends up missing a column.
 */
const bookShape = {
  slug: BookSlugSchema,
  titleAr: z.string().trim().min(2, 'اسم الكتاب مطلوب').max(160),
  subtitleAr: z.string().trim().max(200).nullable().default(null),
  subjectId: z.uuid().nullable().default(null),
  year: z.number().int().min(1).max(3).nullable().default(null),
  term: BookTermSchema.default('full'),
  /** Links this catalogue row to the course whose textbook it is. UNIQUE in the
   *  database, so a second book claiming the same course is a 409. */
  courseId: z.uuid().nullable().default(null),
  priceCents,
  comparePriceCents: priceCents.nullable().default(null),
  /** Cost per copy. Deliberately NOT refined against `priceCents`: selling
   *  below cost is a real decision (clearing old stock), and the ledger's job
   *  is to report the loss, not to forbid it. */
  unitCostCents: priceCents.nullable().default(null),
  coverKey: z.string().trim().min(1).max(255).nullable().default(null),
  descriptionAr: z.string().trim().max(2_000).nullable().default(null),
  pageCount: z.number().int().min(1).max(5_000).nullable().default(null),
  isActive: z.boolean().default(true),
  stock: z.number().int().min(0).max(100_000).nullable().default(null),
  sortOrder: z.number().int().min(0).max(9_999).default(0),
} as const;

export const AdminBookCreateSchema = z
  .object(bookShape)
  .strict()
  /* The same rule `books_compare_price_above_price` enforces, stated here so it
     arrives as a field error on the form rather than a 500 from the database. */
  .refine(
    (value) => value.comparePriceCents === null || value.comparePriceCents > value.priceCents,
    { message: 'السعر قبل الخصم لازم يكون أعلى من السعر الحالي', path: ['comparePriceCents'] },
  );
export type AdminBookCreateInput = z.infer<typeof AdminBookCreateSchema>;

/**
 * Every field optional — renaming a book must not require resending its price.
 *
 * ⚠️ `partialWithoutDefaults`, never `.partial()`. A plain `.partial()` keeps
 * each field's `.default()`, and Zod applies a default whenever a key is absent
 * — so a PATCH carrying only `{ titleAr }` would arrive with `isActive: true`,
 * `stock: null` and `sortOrder: 0` filled in and the service would write all of
 * them. That is the exact bug that once un-published a lecture on rename; see
 * that helper's own docblock.
 *
 * The compare-price rule is restated because the create-time version reads a
 * `priceCents` that a patch may simply not carry.
 */
export const AdminBookPatchSchema = z
  .object(partialWithoutDefaults(bookShape))
  .strict()
  .refine(
    (value) =>
      value.comparePriceCents == null ||
      value.priceCents === undefined ||
      value.comparePriceCents > value.priceCents,
    { message: 'السعر قبل الخصم لازم يكون أعلى من السعر الحالي', path: ['comparePriceCents'] },
  )
  .refine((value) => Object.keys(value).length > 0, { message: 'مفيش حاجة اتغيرت' });
export type AdminBookPatchInput = z.infer<typeof AdminBookPatchSchema>;

/**
 * One line of an order, as the admin editor sends it back.
 *
 * `bookId` is nullable so an admin can type a line the catalogue does not carry
 * — «كتاب خاص» — and `titleAr` is always sent so the line keeps a name whether
 * or not it points at a book. Both are stored as written: they are the snapshot
 * the order is owed, not a view of the catalogue.
 */
export const AdminBookOrderLineInputSchema = z
  .object({
    bookId: z.uuid().nullable().default(null),
    titleAr: z.string().trim().min(2, 'اسم الكتاب مطلوب').max(160),
    unitPriceCents: priceCents,
    quantity: z.number().int().min(1).max(MAX_BOOK_QUANTITY),
  })
  .strict();
export type AdminBookOrderLineInput = z.infer<typeof AdminBookOrderLineInputSchema>;

/**
 * A basket an admin typed — at most one line per catalogue book.
 *
 * ⚠️ This refinement is load-bearing, not tidiness. `book_order_items` carries
 * a UNIQUE index on `(order_id, book_id)`, so two lines naming the same book
 * are a P2002 the moment they are written — a 500 with a constraint name in it,
 * on a screen where the admin's only mistake was picking the same title twice.
 * Rejecting it here turns that into a field message.
 *
 * Lines with `bookId: null` are deliberately NOT constrained: Postgres treats
 * NULLs as distinct, the index does not cover them, and several «كتاب خاص»
 * lines on one order are legitimate.
 */
export const AdminBookOrderLinesSchema = z
  .array(AdminBookOrderLineInputSchema)
  .min(1)
  .max(MAX_CART_LINES)
  .refine(
    (lines) => {
      const ids = lines.map((line) => line.bookId).filter((id): id is string => id !== null);
      return new Set(ids).size === ids.length;
    },
    { message: 'الكتاب الواحد يتكتب مرة واحدة بالعدد المطلوب' },
  );

/**
 * «أعدل الطلب» — the whole editable surface of one order, in one PATCH.
 *
 * `items` REPLACES the order's lines rather than merging into them. A merge
 * needs a stable line id round-tripping through the form, and the one operation
 * the screen has to support — «شيل الكتاب ده وحط التاني» — is a replacement
 * anyway. Sending the lines you want is unambiguous; sending a diff is not.
 *
 * Everything is optional: correcting a phone number must not force the client
 * to resend the basket. The totals are NEVER sent — the server recomputes them
 * from the lines, the shipping and the discount using the same
 * `bookOrderTotals` the cart used, because a total posted from a form is a
 * total that can disagree with the lines beside it.
 */
export const AdminBookOrderPatchSchema = z
  .object({
    items: AdminBookOrderLinesSchema.optional(),
    /** Waiving delivery is `0`, and it is a real thing an admin does. */
    shippingCents: priceCents.optional(),
    discountCents: priceCents.optional(),
    fullName: z.string().trim().min(2).max(120).optional(),
    governorateCode: z.string().length(2).optional(),
    city: z.string().trim().min(1).max(100).optional(),
    addressStreet: z.string().trim().min(1).max(200).optional(),
    addressBuilding: z.string().trim().max(60).nullable().optional(),
    addressNote: z.string().trim().max(300).nullable().optional(),
    /** Internal. Never shown to the customer — see the model note. */
    adminNote: z.string().trim().max(1_000).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'مفيش حاجة اتغيرت' });
export type AdminBookOrderPatchInput = z.infer<typeof AdminBookOrderPatchSchema>;
