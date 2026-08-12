import { cache } from 'react';
import { ActivityFeedSchema, type ActivityFeed } from '@ayman/contracts';
import { apiGetAuthed } from './api-server';

/**
 * `GET /api/me/activity` — the FIRST page of the student's timeline, shared
 * across one render.
 *
 * ## Why this exists at all
 *
 * `/profile` reads the feed twice: the watch-time tile sums the sittings, and
 * the timeline lists them. Those were two separate calls asking for two
 * different windows (`?limit=50` and the bare default), which is both a
 * redundant round trip and, worse, a correctness bug — the page's own
 * docstring promises that the total and the list under it are «derived from
 * the same rows», and a total over fifty sittings above a list of twenty is
 * exactly the disagreement that promise exists to prevent.
 *
 * One function, no window to get wrong.
 *
 * ## Why it takes no `limit`
 *
 * Deliberately. The page wants «the first page», and the only definition of
 * that which cannot drift is the API's own: `activity.controller.ts` clamps a
 * missing `?limit` to `DEFAULT_LIMIT`, and `<ActivityFeed>`'s "load more"
 * likewise sends only a cursor, so every page after the first is that same
 * size. Naming a number here would put a copy of that constant on the far side
 * of an HTTP boundary, free to drift from the server's the day it changes —
 * and a `limit` parameter would let one caller pass 50 and quietly reopen the
 * disagreement this module was written to close. A caller that genuinely wants
 * a different window should be a second, visibly separate request.
 *
 * ## Why `cache()` and not `'use cache'`
 *
 * The same reason `lib/mastery.ts` spells out at length: this is per-student
 * data behind a cookie, and it takes no arguments, so a shared cache entry
 * would have nothing to key on and would serve the first student's timeline to
 * everyone after them. `cache()` is per-request, and `apiGetAuthed` leaves its
 * `fetch` on `no-store`.
 *
 * The two callers stay in separate Suspense boundaries: `cache()` shares the
 * promise, it does not merge the boundaries, so the tile and the timeline still
 * stream independently of each other and of the rest of the page.
 *
 * Server Components / Server Actions only: `apiGetAuthed` reads `cookies()`.
 */
export const getActivity = cache(async function getActivity(): Promise<ActivityFeed> {
  return apiGetAuthed('/api/me/activity', ActivityFeedSchema);
});
