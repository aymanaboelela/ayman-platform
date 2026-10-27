/**
 * `GET /api/admin/mobile/pending` — the number on the app icon.
 *
 * Read by `sw.js` when an admin push arrives with no tab open, which is the
 * only moment the icon can be corrected without the app running. The admin
 * shell sums the same four queues from its own badge providers while it is
 * open (`app-badge.tsx`), so the two must agree on WHICH queues count: the
 * ones with a person waiting on money or a mark. The inbox and essay grading
 * are left out on purpose — both have their own red dot inside the app, and
 * a number that also counts unanswered chat would never reach zero.
 *
 * A queue the caller cannot see (no permission, or the feature is off on
 * this stack) is `0`, never absent — the icon is a sum, and a missing term
 * would make the reader guess.
 *
 * A plain interface, no Zod: the only reader is a service worker with no
 * bundler, and the web shell never fetches it.
 */
export interface AdminMobilePending {
  payments: number;
  walletTopups: number;
  bookOrders: number;
  homework: number;
  total: number;
}
