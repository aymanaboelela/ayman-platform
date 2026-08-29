import { z } from '@ayman/contracts/zod';
import { egyptianPhone } from '@ayman/contracts/phone';

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

export const BookOrderStatusSchema = z.enum(['address_only', 'paid', 'shipped']);
export type BookOrderStatus = z.infer<typeof BookOrderStatusSchema>;

/**
 * Step one — the address form. `courseId` names which course's book this is
 * for; the price is derived server-side from `Course.bookPriceCents`, never
 * student input, same rule `SubmitPaymentSchema` follows for `amountCents`.
 */
export const CreateBookOrderSchema = z
  .object({
    courseId: z.uuid(),
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
  .strict();
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
  courseId: z.uuid(),
  courseTitle: z.string(),
  bookTitle: z.string(),
  /** The book's price at the moment the address form was submitted — see
   *  the model note on `BookOrder.amountCents`. */
  amountCents: z.number().int(),
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
  createdAt: z.iso.datetime(),
};

/** A student's own order — never another student's. */
export const BookOrderSchema = z.object(base);
export type BookOrder = z.infer<typeof BookOrderSchema>;
