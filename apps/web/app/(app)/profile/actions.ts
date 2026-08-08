'use server';

import { revalidatePath } from 'next/cache';

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
 * ## Why it revalidates the LAYOUT and not just this page
 *
 * The avatar renders in the account menu, which lives in the `(app)` layout.
 * Revalidating only `/profile` would update the profile header and leave the
 * topbar showing the old photo until a hard reload — which reads as "the
 * upload didn't work" even though it did.
 */
export async function refreshAvatarAction(): Promise<void> {
  revalidatePath('/profile');
  revalidatePath('/', 'layout');
}
