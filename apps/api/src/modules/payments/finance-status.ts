/**
 * Pure helpers behind `/admin/finance`: turning a grant's `validUntil` into a
 * status word, and deciding whether a submission counts toward the revenue
 * total.
 */

export type FinanceStatus = 'active' | 'expiring_soon' | 'expired';

/**
 * «هيخلص قريب» starts seven days out on THIS screen — a wider, display-only
 * threshold than `SubscriptionExpirySweeper`'s three-day `WARNING_WINDOW_MS`.
 * The two are deliberately different numbers for different jobs: this one
 * only colours a badge on a page an admin opens by choice, so it can afford
 * to flag a subscription a full week ahead; the sweeper interrupts a student
 * with a notification, which earns a narrower, more urgent window.
 */
export const EXPIRING_SOON_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * `expired` when the grant has already lapsed, `expiring_soon` inside the
 * window (inclusive — a renewal made with hours to spare should not have
 * shown as comfortably "active" a minute earlier), `active` otherwise.
 */
export function financeStatusFor(
  validUntil: Date,
  now: Date,
  windowMs: number = EXPIRING_SOON_WINDOW_MS,
): FinanceStatus {
  if (validUntil.getTime() < now.getTime()) return 'expired';
  if (validUntil.getTime() - now.getTime() <= windowMs) return 'expiring_soon';
  return 'active';
}

/**
 * Whether an approved `PaymentSubmission` counts toward
 * `summary.revenueTotalCents`. An admin-comped term (`isFree`) grants the
 * exact same access, computed by the exact same expiry math, as a genuinely
 * paid one — the only thing `isFree` may ever change is whether the money it
 * records is real. `FinanceService.list`'s revenue aggregate filters on this
 * directly rather than trusting `amountCents === 0`: every priced plan's
 * price is `> 0`, so that coincidence happens to hold today, but a filter
 * that says so explicitly stays correct even if that ever stops being true.
 */
export function countsAsRevenue(submission: { isFree: boolean }): boolean {
  return !submission.isFree;
}

/**
 * The amount a `PaymentSubmission` records as actually COLLECTED, as opposed
 * to what the chosen plan is worth. `PaymentsService.adminManualSubscribe`
 * calls this once, at the one place a submission's `amountCents` is decided
 * for a comped term — `planPriceCents` is what `PLAN_LABEL`/`formatEGP`
 * still show everywhere else on that course, `0` is what actually reached
 * the bank.
 */
export function amountCollectedCents(planPriceCents: number, isFree: boolean): number {
  return isFree ? 0 : planPriceCents;
}
