'use server';

import { refresh } from 'next/cache';
import { apiCommand } from '@/lib/api-server';

/**
 * Marking notifications read.
 *
 * ## Why both call `refresh()` and NOT `revalidatePath('/', 'layout')`
 *
 * The unread badge lives in the topbar, which is part of `(app)/layout.tsx` —
 * not of any page. So something has to re-render the layout, or the list
 * updates and the badge keeps the old count until a hard reload, which reads
 * as "the click didn't work". Both of these actions used to reach for
 * `revalidatePath('/', 'layout')` to get that, and the cost of that line is
 * out of all proportion to the badge.
 *
 * Verified in the installed next@16.2.11: `revalidate.js:81-100` turns
 * `revalidatePath('/', 'layout')` into the tag `${NEXT_CACHE_IMPLICIT_TAG_ID}
 * /layout`, and `implicit-tags.js:15-18` puts `/layout` in EVERY route's
 * implicit tag set — so it is not a tag about this route, it is a tag about
 * all of them. `use-cache-wrapper.js:1529-1535` then discards any entry whose
 * timestamp predates the expiry, and this repo's own
 * `cache-handler/redis.js:430-452` writes that expiry into the shared
 * `next:tags` hash which `:391-411` HGETALLs into every replica before each
 * request. One student tapping one notification therefore cold-started
 * `getBranding()`, `getPublicSettingsOrDefaults()`, `getCatalogOrEmpty()`,
 * `getCourse()`, `getHomeBlocks()`, `getNewsList()`, `getTaxonomyOrNull()` and
 * `highlightCode()`'s `cacheLife('max')` Shiki output — for whoever landed
 * next, signed in or not, on any machine in the cluster.
 *
 * `refresh()` is sufficient AND exact here because the bell's data is not
 * cached at all: `notification-bell.tsx` is two bare `apiGetAuthed` calls, so
 * there was never a cache entry that needed touching. `refresh()` re-renders
 * the dynamic tree and leaves every `'use cache'` entry alone
 * (`revalidate.js:65-80`; it marks the store `ActionDidRevalidateDynamicOnly`).
 *
 * ⚠️ The precondition for that sufficiency is that the unread count stays
 * OUTSIDE any `'use cache'` boundary. If the count is ever moved inside one,
 * the badge will silently stop updating here — no error, just a number that
 * never changes — and the fix is a `cacheTag` on that loader plus
 * `updateTag()` beside this call, never a return to the layout-wide purge.
 *
 * ⚠️ `refresh()` throws outside a Server Action in the `'action'` phase
 * (`revalidate.js:66-78`). Both of these are `'use server'` functions invoked
 * from a transition in `notification-bell-client.tsx`, which satisfies it.
 * Note that the client navigates BEFORE calling the action, so the refresh
 * lands on the DESTINATION route's tree — which still carries the `(app)`
 * layout, and therefore the badge.
 *
 * ## Why the id is not validated here
 *
 * It goes into a path segment on a request the API authorises by
 * `{ id, userId }`, where a guessed or malformed id updates zero rows. A UUID
 * check here would move the rejection earlier for honest callers while proving
 * nothing about hostile ones. It IS encoded, because a path segment must be.
 */
export async function markNotificationReadAction(id: string): Promise<void> {
  await apiCommand('POST', `/api/me/notifications/${encodeURIComponent(id)}/read`);
  refresh();
}

export async function markAllNotificationsReadAction(): Promise<void> {
  await apiCommand('POST', '/api/me/notifications/read-all');
  refresh();
}
