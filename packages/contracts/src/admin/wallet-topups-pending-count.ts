/**
 * `GET /api/admin/wallet-topups?status=pending&perPage=10` — read for
 * `rowCount` alone, by the «طلبات الشحن» sidebar badge.
 *
 * Hand-narrowed for the reason `parseAdminPaymentsPendingCount` is: the
 * provider that reads it is mounted on every admin page, and parsing one
 * integer through `AdminWalletTopupListSchema` would drag Zod and the whole
 * row schema into the first chunk of every admin screen.
 */
export function parseAdminWalletTopupsPendingCount(value: unknown): number {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('wallet top-ups pending count: expected an object');
  }

  const { rowCount } = value as Record<string, unknown>;

  if (typeof rowCount !== 'number' || !Number.isInteger(rowCount) || rowCount < 0) {
    throw new TypeError('wallet top-ups pending count: `rowCount` must be a non-negative integer');
  }

  return rowCount;
}
