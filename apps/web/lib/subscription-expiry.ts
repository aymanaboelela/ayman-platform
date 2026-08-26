import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';

/**
 * The enrolled-course card's expiry line — asked for as «الاشتراك بينتهي في
 * [تاريخ]» or «باقي كذا يوم».
 *
 * Pure and its own module so `enrolled-course-card.tsx` stays a render, and
 * so the day-count boundaries (today, the week-out cutoff, already lapsed)
 * are testable without mounting a component.
 */

/** Inside this many days, the line switches from an absolute date to a
 *  countdown — the same width the admin finance screen's `expiring_soon`
 *  status uses (`EXPIRING_SOON_WINDOW_MS` in the API's `finance-status.ts`),
 *  since both are the same "worth a glance, not yet urgent" threshold shown
 *  to someone who is not being interrupted for it. Kept in sync by
 *  convention rather than import — the two live in different packages and
 *  neither has runtime access to the other's constant.
 *
 *  Deliberately WIDER than `SubscriptionExpirySweeper`'s three-day
 *  `WARNING_WINDOW_MS`: a notification is a push and earns a narrower,
 *  more urgent window; this card is only ever seen by a student already
 *  looking at their dashboard, so it can afford to say something a full
 *  week out. */
const SOON_WINDOW_DAYS = 7;

const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium' });

/**
 * `null` when there is nothing to say: no subscription at all
 * (`validUntilIso === null`, a free or admin-granted course), or one that has
 * already lapsed — a lapsed grant is what the access gate itself explains
 * when the student next opens the course, and repeating "expired" on a card
 * that still opens fine would just be a second, out-of-sync source of truth
 * for the same fact.
 */
export function subscriptionExpiryLabel(validUntilIso: string | null, now: Date): string | null {
  if (validUntilIso === null) return null;

  const validUntil = new Date(validUntilIso);
  if (validUntil.getTime() < now.getTime()) return null;

  // CALENDAR days between the two dates' UTC midnights, not a raw ms/day
  // division — an expiry at 18:00 today is still "today" even though under
  // eight hours remain, and dividing by a flat 86 400 000 would round that up
  // to "tomorrow" and skip the word a student expects to see on the day it
  // actually happens.
  const nowDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const validUntilDay = Date.UTC(
    validUntil.getUTCFullYear(),
    validUntil.getUTCMonth(),
    validUntil.getUTCDate(),
  );
  const daysLeft = Math.round((validUntilDay - nowDay) / (24 * 60 * 60 * 1000));

  if (daysLeft === 0) return copy.dashboard.subscriptionExpiresToday;
  if (daysLeft <= SOON_WINDOW_DAYS) {
    return formatCopy(copy.dashboard.subscriptionExpiresInDays, { days: daysLeft });
  }
  return formatCopy(copy.dashboard.subscriptionExpiresOn, { date: dateFormatter.format(validUntil) });
}
