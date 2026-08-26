/**
 * Pure helpers behind `/admin/finance`: turning a grant's `validUntil` into a
 * status word, and finding a calendar month's UTC bounds for "revenue THIS
 * month".
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
 * `[start, end)` of the UTC calendar month `now` falls in — half-open, so a
 * `reviewedAt` right at midnight on the 1st of next month is correctly
 * excluded rather than double-counted by a `<=` on the wrong boundary.
 */
export function monthRangeUTC(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}
