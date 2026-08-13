import { UnreadCountSchema } from '@ayman/contracts';
import { apiGetAuthed } from '@/lib/api-server';
import { NotificationBellClient } from './notification-bell-client';

/**
 * The bell in the topbar — the slot slice 1 deliberately left empty rather
 * than shipping chrome that opened onto nothing.
 *
 * An async Server Component inside its own `<Suspense>`, for the reason
 * `(app)/layout.tsx` sets out at length: the shell must not `await` anything,
 * or every client-side transition into the group blocks on a round-trip with
 * the previous page still mounted.
 *
 * ## One read, where there used to be two
 *
 * This also fetched the panel's first eight rows and handed them down as a
 * prop. Nothing ever painted them before a tap: Radix does not mount
 * `<DropdownMenuContent>` while the menu is closed, so on every ordinary
 * signed-in page that second read spent one of the student's ten requests a
 * second and serialised two to four kilobytes of Arabic notification rows
 * into the Flight payload, for markup that was never in the document. The
 * rows are now fetched by the client, when the panel is actually opened.
 *
 * The read below used to be paid on the attempt route too, where
 * `student-shell.tsx` discards the entire shell — bell included — AFTER the
 * layout has rendered and serialised it: the runner was loading questions and
 * arming its autosave heartbeat while a count nobody could see was in flight.
 * Halving it was as far as this file reached; the other half was thought to
 * need the runner moved out of the `(app)` route group, which is a routing
 * change and not a data-fetching one.
 *
 * It did not. `proxy.ts` stamps the pathname on the request and
 * `<ChromeUnlessAttempt>` — wrapped around this component in
 * `(app)/layout.tsx` — returns `null` on an attempt route, so this never
 * renders there and the count is never fetched. The runner's own route,
 * `/review` and the group's layout are all exactly where they were.
 *
 * The COUNT stays here, and stays on the server, because it is what the badge
 * is made of: it has to be right on first paint, without a tap, or the bell
 * stops being a reason to look at the bell. It is its own endpoint rather
 * than `entries.filter(unread).length` because it must be right about the
 * WHOLE history, not about the eight rows the panel happens to hold — which
 * is now doubly true, since those eight rows no longer exist at this point.
 */
export async function NotificationBell() {
  const count = await apiGetAuthed('/api/me/notifications/unread-count', UnreadCountSchema);

  return <NotificationBellClient unread={count.unread} />;
}

/**
 * Holds the bell's exact footprint while the count is in flight, so the
 * topbar's end cluster does not shift when it lands. No badge and no
 * shimmer: this resolves in tens of milliseconds and an animation that brief
 * reads as a glitch.
 */
export function NotificationBellFallback() {
  return <span aria-hidden="true" className="block size-9 shrink-0" />;
}
