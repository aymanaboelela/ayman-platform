import { z } from '@ayman/contracts/zod';
import { PaymentPlanSchema } from '@ayman/contracts/payments';
import { CouponCodeSchema } from '@ayman/contracts/coupon-code';

/**
 * «كود الخصم» — the student's half of the coupon feature, and the arithmetic
 * both halves share.
 *
 * ## The price is never the client's
 *
 * The checkout sends a CODE and the same plan/term/months it would send
 * anyway, and gets back what the server computed. `POST /payments/submissions`
 * and `POST /payments/wallet-purchase` take the same code and compute it all
 * again, under the coupon's row lock, from the course's live price — the quote
 * is a preview, never an input.
 *
 * ## Whole pounds, on purpose
 *
 * A percentage is floored to a whole pound before it comes off. InstaPay
 * transfers are matched to a claim by the exact amount (`TransfersService`),
 * and the checkout copies the amount as whole pounds — a «١٨٧٫٥٠» left by a
 * 25% coupon on 250 would be a claim no transfer can ever match. The fixed
 * kind is whole pounds by schema for the same reason.
 *
 * No relative imports — same rule as every other leaf module in this package.
 */

export const CouponKindSchema = z.enum(['percent', 'fixed']);
export type CouponKind = z.infer<typeof CouponKindSchema>;

/**
 * Why a code was refused — the 422 body's `code` is `coupon_<reason>`, and
 * each one is its own sentence on the checkout.
 *
 * - `exceeds_price` — the discount would make the purchase free or less; a
 *   transfer of zero is not a payment, and a free subscription is an admin's
 *   decision on the student's page, not a code.
 * - `unavailable` — the feature is off on this stack.
 */
export const CouponRefusalSchema = z.enum([
  'not_found',
  'inactive',
  'not_started',
  'expired',
  'exhausted',
  'per_student_limit',
  'not_for_course',
  'exceeds_price',
  'unavailable',
]);
export type CouponRefusal = z.infer<typeof CouponRefusalSchema>;

/**
 * What comes off `priceCents`, in piastres — floored to a whole pound for a
 * percentage (see the header). The caller refuses a result that is `0` or
 * reaches the price; this function only does the arithmetic.
 */
export function couponDiscountCents(
  coupon: { kind: CouponKind; percentOff: number | null; amountOffCents: number | null },
  priceCents: number,
): number {
  if (coupon.kind === 'percent') {
    const raw = Math.floor((priceCents * (coupon.percentOff ?? 0)) / 100);
    return Math.floor(raw / 100) * 100;
  }
  return coupon.amountOffCents ?? 0;
}

/**
 * «طبّق الكود» on the checkout — the purchase as the student has picked it so
 * far, plus the code. The same refinements as `SubmitPaymentSchema`, because
 * the price it quotes has to be the one that purchase will be charged.
 */
export const CouponQuoteRequestSchema = z
  .object({
    code: CouponCodeSchema,
    courseId: z.uuid(),
    plan: PaymentPlanSchema,
    termId: z.uuid().nullable().default(null),
    monthIds: z.uuid().array().max(12).default([]),
  })
  .strict()
  .refine((value) => (value.plan === 'term') === (value.termId !== null), {
    message: 'لازم تختار الترم اللي هتشترك فيه',
    path: ['termId'],
  })
  .refine((value) => value.plan === 'monthly' || value.monthIds.length === 0, {
    message: 'الشهور بتتحدد مع الاشتراك الشهري بس',
    path: ['monthIds'],
  })
  .refine((value) => new Set(value.monthIds).size === value.monthIds.length, {
    message: 'فيه شهر مكرر',
    path: ['monthIds'],
  });
export type CouponQuoteRequest = z.infer<typeof CouponQuoteRequestSchema>;

export const CouponQuoteSchema = z.object({
  /** Normalised — what the checkout sends back on submit. */
  code: z.string(),
  originalCents: z.number().int().min(1),
  discountCents: z.number().int().min(1),
  /** What the student pays: `originalCents - discountCents`, always ≥ 1 pound. */
  finalCents: z.number().int().min(1),
});
export type CouponQuote = z.infer<typeof CouponQuoteSchema>;

