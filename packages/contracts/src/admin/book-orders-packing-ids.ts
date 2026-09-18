/**
 * `GET /api/admin/book-orders/packing-list` — read for `orderIds` alone, by
 * «حدّد اللي في المدى».
 *
 * ## Why the button asks the server at all
 *
 * It used to tick the rows RENDERED on the page, and the page is fifty rows
 * long. On a tab holding fifty-two the button read «(50)» while the sidebar
 * badge read «52», and a batch «اتشحن» left the last two behind with nothing
 * on screen saying so. The ids come from the same query the spreadsheet and
 * the printed sheet are built from, so the selection, the file and the badge
 * are one set by construction rather than by three implementations agreeing.
 *
 * ## Why a hand-narrowed reader and not `PackingListSchema.parse`
 *
 * Same reason `parseAdminBookOrdersUnshippedCount` is one: this is read from a
 * client component on the orders screen, and importing `./book-orders` for one
 * array of ids would pull that module's row schema — and everything it imports
 * — into the browser bundle for a list of strings.
 */
export function parseAdminBookOrderIds(value: unknown): string[] {
  return idsAt(value, 'orderIds');
}

/**
 * The same response read for the ids it EXCLUDED — «راجعتهم كلهم، كمّل».
 *
 * A held order is in none of `orderIds`, the sheet, the cards or the
 * spreadsheet, so the toolbar cannot see it at all; this is the one reader that
 * can. See `PackingListSchema.heldOrderIds` for why the exclusion reports
 * itself instead of being silent.
 */
export function parseAdminBookOrderHeldIds(value: unknown): string[] {
  return idsAt(value, 'heldOrderIds');
}

function idsAt(value: unknown, key: 'orderIds' | 'heldOrderIds'): string[] {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('book order packing ids: expected an object');
  }

  const ids = (value as Record<string, unknown>)[key];

  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
    throw new TypeError(`book order packing ids: \`${key}\` must be an array of strings`);
  }

  return ids as string[];
}
