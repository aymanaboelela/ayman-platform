/**
 * `GET /api/admin/homework/pending-count` — read for one integer, by the
 * sidebar badge on «الواجبات».
 *
 * A hand-narrowed reader rather than `HomeworkPendingCountSchema.parse`, for
 * exactly the reason `parseAdminBookOrdersUnshippedCount` is one: this is read
 * from a provider mounted on EVERY admin page, and importing
 * `@ayman/contracts/homework` to check a number would drag that module's row,
 * detail and review schemas — and `client-barrel.test.ts` measures the cost —
 * into the first chunk of every admin screen, for a count nobody reads a row
 * of.
 */
export function parseAdminHomeworkPendingCount(value: unknown): number {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('homework pending count: expected an object');
  }

  const { pending } = value as Record<string, unknown>;

  if (typeof pending !== 'number' || !Number.isInteger(pending) || pending < 0) {
    throw new TypeError('homework pending count: `pending` must be a non-negative integer');
  }

  return pending;
}
