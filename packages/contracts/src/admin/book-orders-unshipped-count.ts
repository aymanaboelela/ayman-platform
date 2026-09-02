/**
 * `GET /api/admin/book-orders?status=paid&perPage=10` — read for `rowCount`
 * alone, by the sidebar badge on «الكتب».
 *
 * `status=paid` is the whole definition: an order is paid for and has not
 * shipped. `shipped` rows are done and `address_only` ones were never paid, so
 * neither is work sitting on the desk. `perPage` must be one of `PAGE_SIZES`
 * (`ListQuerySchema`'s `.refine`) — 10 is the smallest legal value, and
 * `rowCount` does not depend on it.
 *
 * A hand-narrowed reader rather than `AdminBookOrderListSchema.parse`, for the
 * same reason `parseAdminPaymentsPendingCount` is one: this is read from a
 * provider mounted on every admin page, and importing `./book-orders` to check
 * one integer would drag that module's whole row schema — and the modules it
 * imports in turn — into the first chunk of every admin screen, for a count
 * nobody reads a row of.
 */
export function parseAdminBookOrdersUnshippedCount(value: unknown): number {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('book orders unshipped count: expected an object');
  }

  const { rowCount } = value as Record<string, unknown>;

  if (typeof rowCount !== 'number' || !Number.isInteger(rowCount) || rowCount < 0) {
    throw new TypeError('book orders unshipped count: `rowCount` must be a non-negative integer');
  }

  return rowCount;
}
