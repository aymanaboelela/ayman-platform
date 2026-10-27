import { z } from '@ayman/contracts/zod';
import { WHATSAPP_DEVICE_STATES } from '@ayman/contracts/marketing/campaign';

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

/**
 * `GET /api/admin/mobile/today` — the «النهارده» band at the top of `/admin`:
 * the same three facts the night push says, but there whenever the dashboard
 * is open, so the push is a reminder of a screen rather than the only place
 * the day's figures exist.
 *
 * Each part is `null` when the caller may not see it (the same permission its
 * own screen needs) or the stack has no such thing, and the band leaves that
 * tile out — never draws a zero for something it was not allowed to count.
 */
export const AdminMobileTodaySchema = z.object({
  /** Today's paid subscriptions and net money — the finance screen's own
   *  figures for the current Cairo day (`payment:read`). */
  sales: z
    .object({
      count: z.number().int().nonnegative(),
      newCount: z.number().int().nonnegative(),
      renewalCount: z.number().int().nonnegative(),
      netCents: z.number().int(),
    })
    .nullable(),
  /** The WhatsApp sender's state right now (`marketing:read`, and only where
   *  a sender is configured). */
  whatsapp: z.enum(WHATSAPP_DEVICE_STATES).nullable(),
  /** Uploaded lectures whose encode failed for good (`lesson:write`). */
  failedVideos: z
    .object({
      count: z.number().int().nonnegative(),
      lessons: z.array(z.object({ lessonId: z.uuid(), title: z.string() })),
    })
    .nullable(),
});
export type AdminMobileToday = z.infer<typeof AdminMobileTodaySchema>;
