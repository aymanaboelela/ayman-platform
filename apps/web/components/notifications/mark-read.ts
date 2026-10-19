import { resolve } from '@/lib/api';
import { CSRF_HEADER, readCsrfToken } from '@/lib/csrf';

/**
 * Marking notifications read — straight to the API, with NO request body.
 *
 * ## Why not a Server Action any more
 *
 * These were `'use server'` actions, and a Server Action is a POST whose body
 * carries the encoded arguments (`["<id>"]`, or `[]` for «علّم الكل»). Production's
 * error log showed one student's browser delivering those POSTs to `/dashboard`
 * with an EMPTY body, 29 times in a day and a half: Next's action decoder then
 * `JSON.parse('')`s it and throws «Unexpected end of JSON input» (reproduced
 * locally by posting the real action id with no body). Each failure left the
 * notification unread, so the badge never cleared and the student clicked
 * again. Something on that machine — an extension, a filtering proxy, or the
 * click navigating away while the POST was still being written — loses the
 * body, and an action cannot work without one.
 *
 * The API routes need none: `POST /api/me/notifications/:id/read` and
 * `/read-all` take the id from the path and the user from the session, and
 * answer 204. So there is nothing left to lose.
 *
 * `keepalive` because the bell navigates first (`router.push`) and marks
 * second: the request must outlive the page that sent it. The caller runs
 * `router.refresh()` when it lands, which re-renders the `(app)` layout and
 * with it the unread badge — the `refresh()` the action used to call, now on
 * the client side of the same round trip. Neither path touches a `'use cache'`
 * entry; see the history of `app/(app)/notifications/actions.ts` for why the
 * layout-wide `revalidatePath` must never come back here.
 */
async function post(path: string): Promise<void> {
  // A failed mark is not worth an error toast: the dot comes back on the next
  // load, which is the honest state, and the student can open it again.
  await fetch(resolve(path), {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
    headers: { accept: 'application/json', [CSRF_HEADER]: readCsrfToken() },
  }).catch(() => undefined);
}

export function markNotificationRead(id: string): Promise<void> {
  return post(`/api/me/notifications/${encodeURIComponent(id)}/read`);
}

export function markAllNotificationsRead(): Promise<void> {
  return post('/api/me/notifications/read-all');
}
