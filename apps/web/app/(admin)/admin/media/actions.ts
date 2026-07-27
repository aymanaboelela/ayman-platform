'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { MediaAssetSchema, MediaPatchSchema } from '@ayman/contracts/admin/media';
import { resolve } from '@/lib/api';
import { adminSend } from '@/lib/admin-api';
import { CSRF_COOKIE, CSRF_HEADER } from '@/lib/csrf';

export type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * The one action in the admin that sends `multipart/form-data` — `adminSend`
 * always `JSON.stringify`s its body, which a `File` cannot survive, so this
 * builds its own request rather than stretching that helper to cover a
 * shape it was never meant to.
 */
export async function uploadMediaAction(formData: FormData): Promise<ActionResult> {
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { ok: false, message: 'no file selected' };
  }

  try {
    const incoming = await headers();
    const cookie = incoming.get('cookie');
    const csrf = cookie
      ?.split('; ')
      .find((entry) => entry.startsWith(`${CSRF_COOKIE}=`))
      ?.slice(CSRF_COOKIE.length + 1);

    const upstream = new FormData();
    upstream.set('file', file, file.name);

    const response = await fetch(resolve('/api/media'), {
      method: 'POST',
      headers: {
        ...(cookie ? { cookie } : {}),
        [CSRF_HEADER]: csrf ?? 'server-action',
      },
      body: upstream,
      cache: 'no-store',
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`POST /api/media failed with ${response.status}: ${detail.slice(0, 200)}`);
    }

    MediaAssetSchema.parse(await response.json());
    // No cache tag to invalidate here: a brand-new asset is not yet
    // referenced by any cached public loader. `tags.media(id)` exists for
    // the settings/home-block loaders that DO reference an existing asset by
    // id, and those call `updateTag` on their OWN save path (Task 6, 15).
    revalidatePath('/admin/media');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
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
