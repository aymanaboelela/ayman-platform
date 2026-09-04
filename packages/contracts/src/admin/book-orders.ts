import { z } from '@ayman/contracts/zod';
import { BookOrderSchema, BookOrderStatusSchema } from '@ayman/contracts/book-orders';
import { BookOrderLineSchema } from '@ayman/contracts/books';
import { AdminBookOrderLinesSchema } from '@ayman/contracts/admin/books';
import { egyptianPhone } from '@ayman/contracts/phone';
import { ListQuerySchema, listResponse } from '@ayman/contracts/admin/list';

/**
 * The admin's `/admin/books` list — one row per `BookOrder`.
 *
 * `status` splits the screen into exactly the two lists Ayman asked for by
 * name: `address_only` ("started but never paid" — kept, never deleted, on
 * its OWN tab) and `paid`/`shipped` (the "real" orders). See the `BookOrder`
 * model doc for why `status` moving to `paid` needs no separate admin
 * approval click.
 *
 * `q` — «عشان أعرف أوصل». The shipping desk answers the phone, and the
 * caller identifies themselves by whatever they have: their name, the number
 * they ordered on, or where they live. Kept from `ListQuerySchema` rather
 * than omitted (as it was) so all three reach one filter — see
 * `BookOrdersService.adminList` for the fields it actually spans and for why
 * a partial phone number needs normalising before it can match anything.
 */
export const AdminBookOrderQuerySchema = ListQuerySchema.extend({
  status: BookOrderStatusSchema.optional(),
}).omit({ dir: true });
export type AdminBookOrderQuery = z.infer<typeof AdminBookOrderQuerySchema>;

export const AdminBookOrderRowSchema = z.object({
  id: z.uuid(),
  /** `null` for a GUEST order — no account is linked. `fullName`/`phone`
   *  below (the order's own submitted fields) are the source of truth for
   *  shipping either way; these three are incidental account context. */
  userId: z.string().nullable(),
  studentName: z.string().nullable(),
  studentEmail: z.string().nullable(),
  studentPhone: z.string().nullable(),
  /**
   * ⚠️ All four course fields are NULLABLE since the shop shipped. An order
   * placed from `/books` is a basket that may span two years and two subjects,
   * so there is no course to name — `items` below is what such a row is made
   * of, and it is the field the screen renders. The course fields survive for
   * orders that came from a course page's own button, where they are the most
   * useful thing on the row.
   */
  courseId: z.uuid().nullable(),
  courseTitle: z.string().nullable(),
  courseYear: z.number().int().min(1).max(3).nullable(),
  /**
   * Which stream(s) this COURSE serves — `forGeneral`/`forLanguages` on the
   * course itself, not a separate book-language field. The Excel export
   * maps this to «عام» / «لغات» / «الاتنين» for the print shop; see
   * `streamChoiceOf` in `@ayman/contracts/content`.
   */
  courseForGeneral: z.boolean().nullable(),
  courseForLanguages: z.boolean().nullable(),
  bookTitle: z.string(),
  /**
   * Every book in this order, with the price and quantity it was placed at.
   *
   * THE column of this screen — «كل واحد عايز كام كتاب» is read straight off it
   * — and the reason `bookTitle` above is no longer enough on its own. For an
   * order that predates the shop this holds the single line the migration
   * back-filled, so the list has no two shapes to render.
   */
  items: z.array(BookOrderLineSchema),
  amountCents: z.number().int(),
  /** The breakdown behind `amountCents`. Shipping is charged once per order. */
  itemsCents: z.number().int(),
  shippingCents: z.number().int(),
  discountCents: z.number().int(),
  /** What an admin wrote about this order. Never shown to the customer. */
  adminNote: z.string().nullable(),
  fullName: z.string(),
  phone: z.string(),
  altPhone: z.string(),
  governorateCode: z.string(),
  governorateNameAr: z.string(),
  city: z.string(),
  addressStreet: z.string(),
  addressBuilding: z.string().nullable(),
  addressNote: z.string().nullable(),
  /** The Vodafone Cash number the transfer was sent FROM — `null` while
   *  `status: 'address_only'`. */
  senderPhone: z.string().nullable(),
  /** Whether there is a screenshot to open — `null` while `address_only`,
   *  always present once `paid`. Lets the UI skip requesting the screenshot
   *  route for a row that has none. */
  hasScreenshot: z.boolean(),
  status: BookOrderStatusSchema,
  createdAt: z.iso.datetime(),
  paidAt: z.iso.datetime().nullable(),
  shippedAt: z.iso.datetime().nullable(),
});
export type AdminBookOrderRow = z.infer<typeof AdminBookOrderRowSchema>;

export const AdminBookOrderListSchema = listResponse(AdminBookOrderRowSchema);

/** «اتشحن» — `BookOrdersService.markShipped`'s own confirmation, the same
 *  "return what actually happened" convention as `TermSetOpenResultSchema`. */
export const MarkBookOrderShippedResultSchema = z.object({
  id: z.uuid(),
  status: z.literal('shipped'),
  shippedAt: z.iso.datetime(),
});
export type MarkBookOrderShippedResult = z.infer<typeof MarkBookOrderShippedResultSchema>;

/**
 * The book-order revenue tile `/admin/finance` composes ALONGSIDE, never
 * merged into, the subscription summary — see `BookOrdersService
 * .adminRevenueSummary`'s own note on why this stays a separate fetch.
 */
export const AdminBookOrderRevenueSummarySchema = z.object({
  revenueTotalCents: z.number().int().min(0),
  paidCount: z.number().int().min(0),
});
export type AdminBookOrderRevenueSummary = z.infer<typeof AdminBookOrderRevenueSummarySchema>;

/**
 * «أضف طلب كتاب» — an admin entering a customer's order directly from
 * `/admin/books`, rather than a customer going through the public/guest
 * order flow. Reaches `BookOrdersService`'s own `adminCreate`, which produces
 * the EXACT same kind of `BookOrder` row a real customer's order would — see
 * that method's own doc.
 *
 * Same field set as `CreateBookOrderSchema` (the public address form) plus
 * `paid`, the one control that lets the admin skip the two-step flow
 * entirely: `false` saves it exactly like a real customer's abandoned
 * address step (`status: 'address_only'`), `true` records money that
 * already changed hands outside the platform (a WhatsApp transfer, cash in
 * hand) and moves straight to `status: 'paid'` with `paidAt` stamped now —
 * see `adminCreate`'s own note on why this mirrors `submitPayment` rather
 * than reinventing it.
 *
 * `senderPhone`/`screenshotKey` are BOTH optional, unlike the public
 * `SubmitBookOrderPaymentSchema` where both are required — same reasoning as
 * `AdminManualSubscribeSchema.screenshotKey`: an admin recording a payment
 * after the fact often has nothing to attach and may not even have asked for
 * the sender's own number. Meaningful only when `paid: true`; ignored
 * otherwise (see `adminCreate`).
 *
 * No `courseId` restriction encoded here beyond shape — `bookTitle`/
 * `bookPriceCents` being set is checked server-side in `adminCreate`, same
 * as the public flow's own `create()`.
 */
export const AdminCreateBookOrderSchema = z
  .object({
    /** The course-book flow — exactly one of this and `items`. Same rule, and
     *  the same reasoning, as `CreateBookOrderSchema`'s own refinement. */
    courseId: z.uuid().optional(),
    /**
     * «أضيف لحد كتاب وأكتب هيدفع كام» — a basket the admin types.
     *
     * Unlike the public `BookCartSchema`, each line carries its own
     * `unitPriceCents`: this route is behind `book-order:write`, the whole
     * point of the screen is to record what a human agreed to on the phone, and
     * forcing the price back through `books.price_cents` would mean changing
     * the shop for everyone to give one person a discount.
     */
    items: AdminBookOrderLinesSchema.optional(),
    /** Waiving delivery is `0`. Omitted means "charge the current fee". */
    shippingCents: z.number().int().min(0).max(10_000_000).optional(),
    discountCents: z.number().int().min(0).max(10_000_000).optional(),
    adminNote: z.string().trim().max(1_000).nullable().default(null),
    fullName: z.string().trim().min(2, 'الاسم الكامل مطلوب').max(120),
    phone: egyptianPhone('رقم الموبايل مطلوب'),
    altPhone: egyptianPhone('رقم موبايل تاني مطلوب للتواصل'),
    governorateCode: z.string().length(2, 'لازم نحدد المحافظة'),
    city: z.string().trim().min(1, 'المدينة مطلوبة').max(100),
    addressStreet: z.string().trim().min(1, 'اسم الشارع مطلوب').max(200),
    addressBuilding: z.string().trim().max(60).nullable().default(null),
    addressNote: z.string().trim().max(300).nullable().default(null),
    /** `true` — paid now, mirrors `submitPayment`. `false` — address-only,
     *  mirrors `create()` alone, exactly the abandoned-cart shape. */
    paid: z.boolean(),
    senderPhone: egyptianPhone('رقم المحوّل منه غير صالح').nullable().default(null),
    screenshotKey: z.string().min(1).max(255).nullable().default(null),
  })
  .strict()
  .refine((value) => (value.courseId === undefined) !== (value.items === undefined), {
    message: 'الطلب لازم يبقى إما كتاب كورس واحد أو سلة كتب — مش الاتنين',
    path: ['items'],
  });
export type AdminCreateBookOrderInput = z.infer<typeof AdminCreateBookOrderSchema>;

/** The admin-create route's own response — the exact same `BookOrder` shape
 *  a real customer's order would produce. */
export const AdminCreateBookOrderResultSchema = BookOrderSchema;
