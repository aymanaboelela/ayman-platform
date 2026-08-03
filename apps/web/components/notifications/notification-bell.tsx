import { NotificationFeedSchema, UnreadCountSchema } from '@ayman/contracts';
import { apiGetAuthed } from '@/lib/api-server';
import { NotificationBellClient } from './notification-bell-client';

/** How many the panel shows before "شوف الكل" takes over. */
const PANEL_SIZE = 8;

/**
 * The bell in the topbar — the slot slice 1 deliberately left empty rather
 * than shipping chrome that opened onto nothing.
 *
 * An async Server Component inside its own `<Suspense>`, for the reason
 * `(app)/layout.tsx` sets out at length: the shell must not `await` anything,
 * or every client-side transition into the group blocks on a round-trip with
 * the previous page still mounted.
 *
 * Two reads, issued together — they do not depend on each other, so awaiting
 * them in sequence would make the bell wait for the sum of two round-trips.
 * The count is its own endpoint rather than `entries.filter(unread).length`,
 * because the badge must be right about the WHOLE history, not about the
 * eight rows the panel happens to hold.
 */
export async function NotificationBell() {
  const [count, feed] = await Promise.all([
    apiGetAuthed('/api/me/notifications/unread-count', UnreadCountSchema),
    apiGetAuthed(`/api/me/notifications?limit=${PANEL_SIZE}`, NotificationFeedSchema),
  ]);

  return (
    <NotificationBellClient unread={count.unread} entries={feed.entries} />
  );
}

/**
 * Holds the bell's exact footprint while the two reads are in flight, so the
 * topbar's end cluster does not shift when they land. No badge and no
 * shimmer: this resolves in tens of milliseconds and an animation that brief
 * reads as a glitch.
 */
export function NotificationBellFallback() {
  return <span aria-hidden="true" className="block size-9 shrink-0" />;
}
