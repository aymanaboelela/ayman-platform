'use server';

import { revalidatePath, updateTag } from 'next/cache';
import {
  MediaAssetSchema,
  MediaPatchSchema,
  MediaUsageSchema,
  type MediaUsage,
} from '@ayman/contracts/admin/media';
import { adminGet, adminSend, adminSendVoid } from '@/lib/admin-api';
import { tags } from '@/lib/cache-tags';

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

/**
 * What currently points at this asset, asked BEFORE offering to destroy it.
 *
 * `media_assets` has no inbound foreign key anywhere — every reference is a
 * string inside a jsonb blob — so Postgres will happily delete an asset the
 * site is rendering right now. This is the only warning there can be, and it
 * is read on dialog open rather than with the grid: the answer costs a read of
 * the settings singleton plus every home block, and asking it a hundred times
 * to populate a page nobody is deleting from would be absurd.
 */
export async function mediaUsageAction(id: string): Promise<MediaUsage | null> {
  try {
    return await adminGet(`/api/admin/media/${id}/usage`, MediaUsageSchema);
  } catch {
    // `null` is "we could not find out", which the dialog shows as the plain
    // permanent-delete warning. Failing to compute a warning must not become a
    // reason the admin cannot delete a file they own.
    return null;
  }
}

/**
 * PERMANENT delete — row and bytes. The irreversible sibling of
 * `archiveMediaAction`, and the reason `MediaGrid` puts a confirm dialog in
 * front of it rather than a second plain button.
 *
 * Every settings tag is invalidated, not just the media path. An asset that
 * was the favicon or the OG image is referenced from cached public loaders
 * (`getBranding`, `getPublicSettings`), and leaving those cached would keep
 * the site pointing at bytes that no longer exist — a broken image with a year
 * of `immutable` on it.
 */
export async function deleteMediaAction(id: string): Promise<ActionResult> {
  try {
    await adminSendVoid('DELETE', `/api/admin/media/${id}`);
    revalidatePath('/admin/media');
    updateTag(tags.settings('branding'));
    updateTag(tags.settings('seo'));
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/**
 * Called after the BROWSER has replaced an asset's bytes (`replaceImage` in
 * `lib/upload-client.ts` — same 1 MB reasoning as the upload path above).
 *
 * The asset id survives a re-crop but its storage key does not, so every
 * cached loader holding the old key has to be dropped or the site keeps
 * rendering the previous crop until the entry expires on its own.
 */
export async function refreshAfterRecropAction(): Promise<void> {
  revalidatePath('/admin/media');
  updateTag(tags.settings('branding'));
  updateTag(tags.settings('seo'));
}
