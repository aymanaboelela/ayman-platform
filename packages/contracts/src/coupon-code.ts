import { z } from '@ayman/contracts/zod';

/**
 * The coupon CODE alone — its own leaf so `payments.ts` and `wallet.ts` can
 * carry the optional field without importing `coupons.ts`, which imports
 * `payments.ts` for the plan enum. See `coupons.ts` for the feature.
 */

/** Letters, digits, `-` and `_`; compared without case (stored upper-case). */
export const COUPON_CODE_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;

/** «ramadan25 » and «RAMADAN25» are the same coupon. */
export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export const CouponCodeSchema = z
  .string()
  .trim()
  .regex(COUPON_CODE_PATTERN, 'الكود حروف إنجليزي وأرقام بس، من ٣ لـ ٣٢')
  .transform(normalizeCouponCode);

/**
 * The optional field `SubmitPaymentSchema` and `WalletPurchaseSchema` carry.
 * `null` (and absent, from a tab of the previous build) is «no coupon».
 */
export const OptionalCouponCodeSchema = CouponCodeSchema.nullable().default(null);
