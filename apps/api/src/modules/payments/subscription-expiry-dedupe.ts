/**
 * The pure predicate behind `SubscriptionExpirySweeper`'s dedupe: has this
 * grant, AT ITS CURRENT `validUntil`, already been notified about?
 *
 * `notification.payload` is jsonb, so the sweeper reads back a plain
 * `{ courseId, validUntil }` pair per existing row (via
 * `NotificationsService`'s own `payloadString`-shaped decoding) and hands the
 * result here. Split out so the matching rule — same student, same course,
 * same EXACT expiry timestamp — is testable without a database, the same way
 * `OutreachSweeper.unsent` is a set lookup its callers build but do not
 * reason about inline.
 */

export interface AlreadyNotifiedRow {
  userId: string;
  courseId: string;
  validUntil: string;
}

export interface ExpiringCandidate {
  userId: string;
  courseId: string;
  /** ISO — the grant's CURRENT `validUntil`, matched EXACTLY. A renewal that
   *  pushes the date forward is therefore a fresh candidate: the old
   *  notification was about a term that no longer exists, and the student
   *  earns a new heads-up for the new one when it, in turn, comes due. */
  validUntil: string;
}

/**
 * `candidates` not already covered by `sent` — pairs of
 * `(userId, courseId, validUntil)` a `subscription_expiring_soon`
 * notification already exists for, within whatever lookback window the
 * caller queried.
 */
export function needsExpiryNotice(
  candidates: readonly ExpiringCandidate[],
  sent: readonly AlreadyNotifiedRow[],
): ExpiringCandidate[] {
  const already = new Set(sent.map((row) => dedupeKey(row.userId, row.courseId, row.validUntil)));
  return candidates.filter(
    (candidate) => !already.has(dedupeKey(candidate.userId, candidate.courseId, candidate.validUntil)),
  );
}

function dedupeKey(userId: string, courseId: string, validUntil: string): string {
  return `${userId}:${courseId}:${validUntil}`;
}
