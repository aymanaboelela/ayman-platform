/**
 * `GET /api/admin/payments/submissions?status=pending&perPage=10` — read for
 * `rowCount` alone, by the sidebar badge. `perPage` must be one of
 * `PAGE_SIZES` (`ListQuerySchema`'s `.refine`) — 10 is the smallest legal
 * value, and `rowCount` does not depend on it.
 *
 * A hand-narrowed reader rather than `AdminPaymentListSchema.parse`, and for
 * the exact reason `parseAdminUnreadCount` (`assistant/summary.ts`) is not
 * `AdminConversationDetailSchema.parse`: this is read from
 * `PaymentsAlertsProvider`, mounted on every admin page, and importing
 * `./payments` to check one integer would drag that module's whole
 * `AdminPaymentRowSchema` — and the `@ayman/contracts/payments` /
 * `@ayman/contracts/admin/list` modules it in turn imports — into the first
 * chunk of every admin screen for a count nobody reads a row of. The full
 * schema stays on `/admin/payments` and `/admin/finance`, which already pay
 * for it.
 */
export function parseAdminPaymentsPendingCount(value: unknown): number {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('payments pending count: expected an object');
  }

  const { rowCount } = value as Record<string, unknown>;

  if (typeof rowCount !== 'number' || !Number.isInteger(rowCount) || rowCount < 0) {
    throw new TypeError('payments pending count: `rowCount` must be a non-negative integer');
  }

  return rowCount;
}
