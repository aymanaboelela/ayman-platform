'use client';

import { NotificationFeedSchema, type NotificationFeed } from '@ayman/contracts/notifications';
import { apiGet } from '@/lib/api';

/**
 * The panel's rows, and the schema that checks them — kept OUT of the bell's
 * own module on purpose.
 *
 * `<NotificationBellClient>` is mounted in the `(app)` topbar, so it is a
 * client reference on every signed-in route. `NotificationFeedSchema` is Zod,
 * and a static import of it from the bell put Zod's 62 KB gzip runtime into
 * the client reference manifest — and the `<head>` preload — of the dashboard,
 * the player, the library and everything else a student actually spends their
 * time on. The bell itself renders an SVG and a count.
 *
 * Reached by `await import('./notification-feed')` inside the open handler,
 * the same bytes become an async chunk fetched by the tap that needs them.
 * That is the same shape `assistant-catalog.ts` and `assistant-session.ts` use
 * on the public surface, for the same reason.
 *
 * The rows stay VALIDATED. The bell renders `entry.readAt`, `entry.createdAt`
 * and a kind that `describeNotification` switches on exhaustively; an
 * unchecked body turns a contract drift into a blank row rather than an error,
 * and the panel's own failure branch already knows how to say "لم نتمكن".
 */
export function loadNotificationFeed(limit: number): Promise<NotificationFeed> {
  return apiGet(`/api/me/notifications?limit=${limit}`, NotificationFeedSchema);
}
