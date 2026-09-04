import { z } from '@ayman/contracts/zod';
import { egyptianPhone } from '@ayman/contracts/phone';
import { BookCartSchema, BookOrderLineSchema } from '@ayman/contracts/books';

/**
 * الكتاب الورقي — a student ordering the printed textbook of a course that
 * has one (`Course.bookTitle`), for home delivery.
 *
 * ## Two steps, two endpoints — same reasoning as `payments.ts`
 *
 * `POST /book-orders` is step one: the address form ALONE, saved to the
 * database before any payment exists. If the student abandons here, the row
 * is still there — `status: 'address_only'` — so an admin can see someone
 * started an order. `POST /book-orders/:id/payment` is step two: the
 * Vodafone Cash screenshot, same shape as `SubmitPaymentSchema`, moving the
 * SAME row to `status: 'paid'`.
 *
 * ## No `AccessGrant`, ever
 *
 * A book order never grants platform access — it is a physical object, not
 * a subscription. See the `BookOrder` model doc in schema.prisma for why
 * this is its own table rather than a `PaymentSubmission` row, and why
 * submitting the screenshot alone (no separate admin-approval click) is
 * enough to count as "paid".
 *
 * No relative imports — same rule as every other leaf module in this package.
 */

/**
 * The five states an order can be in, in the order it moves through them.
 *
 * `address_only → paid` (the student uploads the transfer) `→ shipped` (the
 * admin hands it to the courier) `→ delivered` (the admin confirms it arrived).
 * `rejected` is the branch off the side: the admin turned the order down and
 * owes the student a reason.
 *
 * ⚠️ Deleting is deliberately NOT in here. An order can be deleted from any of
 * these, and a `deleted` member would erase the state it was deleted FROM —
 * which is the one thing the admin looking at «المحذوفة» needs to see. It is
 * `deletedAt` on the row instead; see `BookOrder`'s model note.
 */
export const BookOrderStatusSchema = z.enum([
  'address_only',
  'paid',
  'shipped',
  'delivered',
  'rejected',
]);
export type BookOrderStatus = z.infer<typeof BookOrderStatusSchema>;

/**
 * Step one — the address form. `courseId` names which course's book this is
 * for; the price is derived server-side from `Course.bookPriceCents`, never
 * student input, same rule `SubmitPaymentSchema` follows for `amountCents`.
 */
export const CreateBookOrderSchema = z
  .object({
    /**
     * ⚠️ OPTIONAL since the shop shipped, and exactly one of `courseId` /
     * `items` must be present — the refinement below is what says so.
     *
     * `courseId` is the original flow: the course page's own «اطلب الكتاب»
     * button, which knows one course and no basket. `items` is `/books`: a cart
     * that may hold a first-year book and a second-year book at once and has no
     * single course to name. Both produce the same order row; they differ only
     * in how the server works out what is being bought, and in nothing after
     * that.
     *
     * Keeping the old field rather than migrating the course page onto carts
     * was deliberate: that button is live, its `localStorage` resume key is
     * `{courseId, bookOrderId}`, and rewriting a working purchase path is not
     * something a catalogue feature should require.
     */
    courseId: z.uuid().optional(),
    /**
     * The basket. Prices are NOT here — see `BookCartLineSchema` for why a
     * price posted from a browser is a price a browser can choose.
     */
    items: BookCartSchema.optional(),
    fullName: z.string().trim().min(2, 'الاسم الكامل مطلوب').max(120),
    phone: egyptianPhone('رقم الموبايل مطلوب'),
    /** A SECOND, alternate contact number — distinct from `phone`. Shipping
     *  a physical object is the one flow here where "couldn't reach the
     *  first number" is routine, not exceptional. */
    altPhone: egyptianPhone('رقم موبايل تاني مطلوب للتواصل'),
    governorateCode: z.string().length(2, 'لازم نحدد المحافظة'),
    /** Free text — no city/مدينة taxonomy exists in this codebase (a full
     *  governorate→city cascade for all of Egypt is out of scope), so this is
     *  a plain required field, same pattern as `addressStreet`/`addressBuilding`.
     *  Shipping companies need it alongside the governorate. */
    city: z.string().trim().min(1, 'المدينة مطلوبة').max(100),
    addressStreet: z.string().trim().min(1, 'اسم الشارع مطلوب').max(200),
    /** Optional — some addresses genuinely have no building number (a named
     *  house, a rural address). `''` → `null`, same convention as
     *  `addressNote`. */
    addressBuilding: z.string().trim().max(60).nullable().default(null),
    /** Free text — apartment number, floor, a landmark. `''` → `null`. */
    addressNote: z.string().trim().max(300).nullable().default(null),
  })
  .strict()
  /*
   * Exactly one, never both and never neither.
   *
   * Neither is a request that names nothing to buy — the server would have to
   * invent a basket. Both is worse: it is two different answers to "what is in
   * this order", and whichever the server picked would be a silent choice
   * nobody could see in the payload. Making it a shape error keeps that
   * decision out of the service entirely.
   */
  .refine((value) => (value.courseId === undefined) !== (value.items === undefined), {
    message: 'الطلب لازم يبقى إما كتاب كورس واحد أو سلة كتب — مش الاتنين',
    path: ['items'],
  });
export type CreateBookOrderInput = z.infer<typeof CreateBookOrderSchema>;

/**
 * Step two — the payment, once the screenshot is already uploaded via
 * `POST /book-orders/screenshot`. Same shape as `SubmitPaymentSchema`.
 */
export const SubmitBookOrderPaymentSchema = z
  .object({
    senderPhone: egyptianPhone('اكتب رقم الموبايل اللي حوّلت منه'),
    screenshotKey: z.string().min(1).max(255),
  })
  .strict();
export type SubmitBookOrderPaymentInput = z.infer<typeof SubmitBookOrderPaymentSchema>;

export const SubmitBookOrderScreenshotResultSchema = z.object({
  screenshotKey: z.string(),
});

const base = {
  id: z.uuid(),
  /** `null` for a CART order — see `CreateBookOrderSchema.courseId`. */
  courseId: z.uuid().nullable(),
  courseTitle: z.string().nullable(),
  /**
   * The single book's title, for the course flow. Kept so the course page's own
   * panel — which has always rendered this one string — is untouched by the
   * shop; a cart order fills it with the first line's title, which is what that
   * panel would want to say anyway if it were ever shown one.
   */
  bookTitle: z.string(),
  /** Every book in the order, with the price and quantity it was placed at. */
  items: z.array(BookOrderLineSchema),
  /**
   * What the order is worth in total — items + shipping − discount, frozen at
   * submit time. See the model note on `BookOrder.amountCents`.
   */
  amountCents: z.number().int(),
  /**
   * The breakdown behind it. Four numbers rather than one because «٥٦٥ جنيه»
   * with nothing explaining the ٦٥ is the commonest reason someone calls to ask
   * whether they were overcharged.
   */
  itemsCents: z.number().int(),
  /** Charged ONCE per order, never per book — «مش منطقي يدفع شحن مرتين». */
  shippingCents: z.number().int(),
  discountCents: z.number().int(),
  status: BookOrderStatusSchema,
  fullName: z.string(),
  phone: z.string(),
  altPhone: z.string(),
  governorateCode: z.string(),
  city: z.string(),
  addressStreet: z.string(),
  addressBuilding: z.string().nullable(),
  addressNote: z.string().nullable(),
  /** `null` until step two. */
  senderPhone: z.string().nullable(),
  paidAt: z.iso.datetime().nullable(),
  shippedAt: z.iso.datetime().nullable(),
  /** Set when the admin confirmed the book ARRIVED — not when it was handed to
   *  the courier. `shippedAt` is what the platform did; this is what happened. */
  deliveredAt: z.iso.datetime().nullable(),
  rejectedAt: z.iso.datetime().nullable(),
  /**
   * Why it was turned down, in the admin's own words, and shown to the student.
   *
   * Non-null exactly when `rejectedAt` is — the database CHECK
   * `book_orders_rejection_has_a_reason` makes the pair inseparable, because a
   * rejected order with no explanation is a phone call.
   */
  rejectionReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
};

/** A student's own order — never another student's. */
export const BookOrderSchema = z.object(base);
export type BookOrder = z.infer<typeof BookOrderSchema>;
