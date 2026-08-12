'use server';

import { refresh, revalidatePath } from 'next/cache';

/**
 * Re-reads the pages that show the student's photo, after the browser has
 * already uploaded it.
 *
 * ## Why this no longer carries the file
 *
 * It used to be `uploadAvatarAction(formData)` — the file went into a Server
 * Action, which forwarded it to the API. Server Actions buffer their payload
 * and cap it at 1 MB by default, and `MAX_AVATAR_BYTES` is 2 MB. So every
 * photo in the 1–2 MB band — which is most of what a phone camera produces —
 * was refused by the framework before this function's first line ran. There
 * was no `catch` that could have reported it, because nothing here was
 * reached: the student pressed the camera, watched it dim, and got their old
 * photo back. `lib/upload-client.ts` has the measurements.
 *
 * The upload now goes browser → `/api/profile/avatar` directly, where the real
 * gates have always been: multer's `limits.fileSize`, `MediaService.
 * uploadAvatar`'s own cap, the extension allowlist, the magic-byte sniff and
 * the sharp re-encode. Nothing was weakened by moving the request; the only
 * thing removed is a hop that was silently truncating it.
 *
 * ## Why it reaches past this page, and why with `refresh()`
 *
 * The avatar renders in the account menu, which lives in the `(app)` layout.
 * Revalidating only `/profile` would update the profile header and leave the
 * topbar showing the old photo until a hard reload — which reads as "the
 * upload didn't work" even though it did.
 *
 * This was `revalidatePath('/', 'layout')`, and that line is far bigger than
 * it looks. Verified in the installed next@16.2.11: `revalidate.js:81-100`
 * turns it into the tag `${NEXT_CACHE_IMPLICIT_TAG_ID}/layout`, which
 * `implicit-tags.js:15-18` puts in EVERY route's implicit tag set — so it is a
 * tag about all routes, not this one — and `use-cache-wrapper.js:1529-1535`
 * then discards every `'use cache'` entry older than that instant. This repo's
 * `cache-handler/redis.js:430-452` writes the expiry into the shared
 * `next:tags` hash, so it lands on every replica. One student changing their
 * photo cold-started `getBranding()`, `getPublicSettingsOrDefaults()`,
 * `getCatalogOrEmpty()`, `getHomeBlocks()`, `getNewsList()` and Shiki's
 * `cacheLife('max')` output for the next visitor to arrive anywhere on the
 * platform, signed in or not.
 *
 * `refresh()` does the job exactly: it re-renders the dynamic tree for this
 * request and touches no cache entry at all (`revalidate.js:65-80` marks the
 * store `ActionDidRevalidateDynamicOnly`). The session — which is where the
 * account menu reads the photo from — is per-request and uncached, so a
 * re-render is the whole of what was ever needed.
 *
 * `revalidatePath('/profile')` stays. It is scoped to one route, and it is
 * what expires this page's own entry rather than merely re-rendering the
 * dynamic parts of it.
 *
 * ⚠️ `refresh()` throws outside a Server Action in the `'action'` phase
 * (`revalidate.js:66-78`); this is `'use server'` and is called from the
 * avatar form's transition, which satisfies it.
 */
export async function refreshAvatarAction(): Promise<void> {
  revalidatePath('/profile');
  refresh();
}
