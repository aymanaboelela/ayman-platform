/**
 * `GET /api/admin/grading-queue/count` — read for one integer, by the sidebar
 * badge on «تصحيح الورق».
 *
 * A hand-narrowed reader rather than `AdminGradingPendingCountSchema.parse`,
 * for the reason its homework and book-order siblings are: the provider that
 * reads this is mounted on EVERY admin page, and importing
 * `@ayman/contracts/admin/exams` to check a number would drag every exam,
 * queue and grading schema in that module into the first chunk of every admin
 * screen — `client-barrel.test.ts` measures the cost — for a count nobody
 * reads a row of.
 */
export function parseAdminGradingPendingCount(value: unknown): number {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('grading pending count: expected an object');
  }

  const { pending } = value as Record<string, unknown>;

  if (typeof pending !== 'number' || !Number.isInteger(pending) || pending < 0) {
    throw new TypeError('grading pending count: `pending` must be a non-negative integer');
  }

  return pending;
}
