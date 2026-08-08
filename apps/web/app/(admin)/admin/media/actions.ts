'use server';

import { revalidatePath } from 'next/cache';
import { MediaAssetSchema, MediaPatchSchema } from '@ayman/contracts/admin/media';
import { adminSend } from '@/lib/admin-api';

export type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * Re-reads the media library after the browser has uploaded something into it.
 *
 * ## Why the file no longer travels through here
 *
 * This was `uploadMediaAction(formData)`: the file went into a Server Action,
 * which forwarded it to `POST /api/media`. Server Actions buffer their payload
 * and cap it at 1 MB by default — a limit `next.config.ts` never raised — so
 * every image over that was refused by the framework before the first line of
 * the action ran. The screen promised 8 MB. Measured on the course cover
 * field: 515 KB saved, 1,056 KB did nothing at all, with no error in the
 * console, no toast and no server log. See `lib/upload-client.ts`.
 *
 * The upload goes browser → `/api/media` directly now, through the same
 * `/api/:path*` rewrite every other client call uses, so it stays same-origin
 * with the session cookie and the CSRF header. Every real gate — the extension
 * allowlist, the magic-byte sniff, the sharp re-encode, the UUID key — is on
 * the API and is untouched.
 *
 * What remains here is the cache invalidation, which is a server concern and
 * cannot be done from the browser.
 */
export async function refreshMediaAction(): Promise<void> {
  // No cache tag to invalidate: a brand-new asset is not yet referenced by any
  // cached public loader. `tags.media(id)` exists for the settings/home-block
  // loaders that DO reference an existing asset by id, and those call
  // `updateTag` on their OWN save path (Task 6, 15).
  revalidatePath('/admin/media');
}

export async function patchMediaAltAction(id: string, altAr: string | null): Promise<ActionResult> {
  try {
    const body = MediaPatchSchema.parse({ altAr });
    await adminSend('PATCH', `/api/admin/media/${id}`, body, MediaAssetSchema);
    revalidatePath('/admin/media');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function archiveMediaAction(id: string): Promise<ActionResult> {
  try {
    await adminSend('POST', `/api/admin/media/${id}/archive`, undefined, MediaAssetSchema);
    revalidatePath('/admin/media');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function restoreMediaAction(id: string): Promise<ActionResult> {
  try {
    await adminSend('POST', `/api/admin/media/${id}/restore`, undefined, MediaAssetSchema);
    revalidatePath('/admin/media');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}
