import { z } from '@ayman/contracts/zod';
import { PaymentPlanSchema, type PaymentPlan } from '@ayman/contracts/payments';
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

/**
 * `per_plan` is «خصم لكل نوع اشتراك» — a fixed number of pounds that depends
 * on WHICH plan is bought: 51 off the month, 150 off the term, nothing off the
 * year. A plan with no amount is a plan the code does not apply to, and the
 * student is told so (`not_for_plan`) rather than charged in full in silence.
 * It is its own kind and not a `fixed` with extras, because «X off» means
 * something different on a 150 month and on a 950 year, and a single number
 * cannot say both.
 */
export const CouponKindSchema = z.enum(['percent', 'fixed', 'per_plan']);
export type CouponKind = z.infer<typeof CouponKindSchema>;

/** Whole pounds in piastres, the same bound as a `fixed` amount. */
export const CouponPlanAmountSchema = z
  .number()
  .int()
  .min(100)
  .max(10_000_000)
  .refine((cents) => cents % 100 === 0, { message: 'الخصم بالجنيه من غير قروش' });

/**
 * One amount per plan for a `per_plan` coupon. `null` = the code does not
 * apply to that plan. Keys are `PaymentPlanSchema`'s, so a fifth plan is a
 * compile error here rather than a plan every per-plan code silently skips.
 */
export const CouponPlanAmountsSchema = z.object({
  monthly: CouponPlanAmountSchema.nullable(),
  quarterly: CouponPlanAmountSchema.nullable(),
  term: CouponPlanAmountSchema.nullable(),
  yearly: CouponPlanAmountSchema.nullable(),
});
export type CouponPlanAmounts = z.infer<typeof CouponPlanAmountsSchema>;
// A plan added to `PaymentPlanSchema` and not here fails to compile on this line.
type _EveryPlanHasAKey = [Exclude<PaymentPlan, keyof CouponPlanAmounts>] extends [never] ? true : never;
const _everyPlanHasAKey: _EveryPlanHasAKey = true;
void _everyPlanHasAKey;

/** Does a per-plan coupon carry at least one amount? (Otherwise it is a code
 *  that applies to nothing.) */
export function hasAnyPlanAmount(amounts: CouponPlanAmounts): boolean {
  return Object.values(amounts).some((cents) => cents !== null);
}

/**
 * Why a code was refused — the 422 body's `code` is `coupon_<reason>`, and
 * each one is its own sentence on the checkout.
 *
 * - `exceeds_price` — the discount would make the purchase free or less; a
 *   transfer of zero is not a payment, and a free subscription is an admin's
 *   decision on the student's page, not a code.
 * - `not_for_plan` — a `per_plan` coupon with no amount for the plan picked
 *   (the month and the term are discounted, the year is not).
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
  'not_for_plan',
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
  coupon: {
    kind: CouponKind;
    percentOff: number | null;
    amountOffCents: number | null;
    planAmounts?: CouponPlanAmounts | null;
  },
  priceCents: number,
  plan?: PaymentPlan,
): number {
  if (coupon.kind === 'percent') {
    const raw = Math.floor((priceCents * (coupon.percentOff ?? 0)) / 100);
    return Math.floor(raw / 100) * 100;
  }
  if (coupon.kind === 'per_plan') {
    // No plan, or no amount for it, is nothing off — the ledger refuses that
    // as `not_for_plan` before it ever gets here; this stays total.
    if (plan === undefined) return 0;
    return coupon.planAmounts?.[plan] ?? 0;
  }
  return coupon.amountOffCents ?? 0;
}

/**
 * The four per-plan columns as the contract's object — `null` for a coupon
 * that is not `per_plan`. One place so the ledger, the admin row and the
 * campaign runner read the columns the same way.
 */
export function planAmountsOf(row: {
  kind: CouponKind;
  monthlyOffCents: number | null;
  quarterlyOffCents: number | null;
  termOffCents: number | null;
  yearlyOffCents: number | null;
}): CouponPlanAmounts | null {
  if (row.kind !== 'per_plan') return null;
  return {
    monthly: row.monthlyOffCents,
    quarterly: row.quarterlyOffCents,
    term: row.termOffCents,
    yearly: row.yearlyOffCents,
  };
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

