/**
 * The pure date math behind a `PaymentSubmission` approval.
 *
 * Split out of `PaymentsService.approve` so the arithmetic can be tested
 * without a database — `payments.service.spec.ts` already covers the whole
 * approval flow against real Postgres, but that only ever exercises the
 * "renew before expiry, today" case that happens to fall out of running the
 * suite the day it runs. The month-end clamp and the renew-after-expiry
 * branch need dates chosen on purpose, which is what `payment-expiry.spec.ts`
 * is for.
 */

export type PaymentPlan = 'monthly' | 'quarterly';

/** The two subscription lengths sold — see `Course.monthlyPriceCents`. */
export const PLAN_MONTHS: Record<PaymentPlan, number> = { monthly: 1, quarterly: 3 };

/**
 * `d + n` months, clamped to the LAST DAY of the target month rather than
 * rolling into the month after.
 *
 * `Date.setMonth` overflows by design — 31 Jan + 1 month lands on 3 Mar in a
 * non-leap year, because February has no 31st and JS resolves that by
 * spilling the extra two days forward. For a subscription that reads as the
 * platform quietly handing out two free days on every month-end signup, and
 * doing it again every renewal. Clamping to the month's real last day is the
 * conventional fix and the only one that keeps "same day next month" true for
 * every day it can be true for.
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const daysInTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, daysInTargetMonth));
  return result;
}

/**
 * The new `validUntil` an approval writes.
 *
 * `existingValidUntil` is the live `purchase` grant's CURRENT expiry, or
 * `null` when this is the student's first approval for the course. Renewing
 * BEFORE the current term ends extends from that term's own end — a
 * quarterly renewal bought a week early adds three months on top of what was
 * left, it does not discard the remainder. Renewing AFTER it lapsed (or a
 * brand new subscription) extends from `now` instead, since there is no
 * remaining term to add on top of.
 *
 * See the model doc on `PaymentSubmission` for why this EXTENDS the one live
 * grant rather than stacking a second one.
 */
export function computeApprovalValidUntil(
  plan: PaymentPlan,
  now: Date,
  existingValidUntil: Date | null,
): Date {
  const baseline = existingValidUntil && existingValidUntil > now ? existingValidUntil : now;
  return addMonthsClamped(baseline, PLAN_MONTHS[plan]);
}
