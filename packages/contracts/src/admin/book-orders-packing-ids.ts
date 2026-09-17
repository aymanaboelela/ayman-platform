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
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('book order packing ids: expected an object');
  }

  const { orderIds } = value as Record<string, unknown>;

  if (!Array.isArray(orderIds) || orderIds.some((id) => typeof id !== 'string')) {
    throw new TypeError('book order packing ids: `orderIds` must be an array of strings');
  }

  return orderIds as string[];
}
