'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { copy } from '@ayman/contracts';
import { MAX_AVATAR_BYTES } from '@ayman/contracts/admin/media';
import { ApiRequestError } from '@/lib/api';
import { apiUpload } from '@/lib/api-server';

const AvatarResultSchema = z.object({ image: z.string() });

export type AvatarActionResult = { ok: true; image: string } | { ok: false; message: string };

/**
 * Replaces the student's profile photo.
 *
 * ## The size and type checks here are UX, not security
 *
 * Rejecting a 9 MB file before it crosses the network saves the student a long
 * upload that was always going to fail, and lets the message name the actual
 * problem. The REAL controls are server-side and unconditional: multer's
 * `limits.fileSize`, then `MediaService.uploadAvatar`'s own cap, extension
 * allowlist, magic-byte sniff and sharp re-encode. Nothing here is trusted —
 * a caller that skips this action entirely hits exactly the same gates.
 *
 * `file.type` is the browser's guess from the extension and is trivially
 * forged; it is checked only so a student who picks a PDF is told so in
 * Arabic instead of waiting for a 400.
 *
 * ## Why it revalidates the layout
 *
 * The avatar renders in the account menu, which lives in the `(app)` LAYOUT,
 * not on this page. Revalidating only `/profile` would update the profile
 * header and leave the topbar showing the old photo until a hard reload —
 * which reads as "the upload didn't work".
 */
export async function uploadAvatarAction(formData: FormData): Promise<AvatarActionResult> {
  const file = formData.get('file');

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: copy.profile.photoFailed };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { ok: false, message: copy.profile.photoTooLarge };
  }
  if (file.type && !file.type.startsWith('image/')) {
    return { ok: false, message: copy.profile.photoWrongType };
  }

  try {
    const result = await apiUpload('/api/profile/avatar', AvatarResultSchema, file);
    revalidatePath('/profile');
    revalidatePath('/', 'layout');
    return { ok: true, image: result.image };
  } catch (error) {
    // 413 and 400 are both "this file, not this system" — the student can fix
    // either by choosing a different photo, and saying so beats surfacing a
    // status code. Anything else is ours and gets the generic message too,
    // because there is nothing useful a student can do about it.
    if (error instanceof ApiRequestError && error.status === 413) {
      return { ok: false, message: copy.profile.photoTooLarge };
    }
    return { ok: false, message: copy.profile.photoFailed };
  }
}
