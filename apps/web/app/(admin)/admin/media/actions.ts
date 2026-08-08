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
/**
 * Widened from `ActionResult` to carry the uploaded asset's `storageKey`.
 *
 * The response was already being parsed and then thrown away, which is why the
 * only way to USE an upload was to go to the media library and find it again —
 * and why the course cover and lesson poster fields, which need a key at the
 * moment of upload, both ended up hardcoding `null`. `<MediaKeyField>` is the
 * caller that needed this; `<UploadForm>` ignores the extra field.
 */
export type UploadResult = { ok: true; storageKey: string } | { ok: false; message: string };

export async function uploadMediaAction(formData: FormData): Promise<UploadResult> {
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
      /*
       * The API's OWN message, not a status line.
       *
       * This used to throw `POST /api/media failed with 400: {…}`, which the
       * caller turned into a generic «فشل الرفع» — so an instructor whose photo
       * was 12 MB, or a `.heic` straight off an iPhone, saw a spinner, then
       * nothing, with no way to find out why. Reported exactly that way: «مش
       * بتتحط أصلًا، بيعمل لودنج وبعد مدة مش بتظهر».
       *
       * `media.service.ts` already answers with a specific reason ("file too
       * large", "unsupported file type", "file could not be processed as an
       * image"); it simply never reached a human. `<MediaKeyField>` maps these
       * to Arabic — see `uploadReason`.
       */
      const detail = await response.text().catch(() => '');
      let apiMessage = '';
      try {
        const parsed: unknown = JSON.parse(detail);
        if (parsed && typeof parsed === 'object' && 'message' in parsed) {
          apiMessage = String((parsed as { message: unknown }).message);
        }
      } catch {
        // A non-JSON body (a proxy's 413 page, most likely) — the status is
        // then the only fact worth carrying, and `uploadReason` reads it.
      }
      return { ok: false, message: apiMessage || `status:${response.status}` };
    }

    const asset = MediaAssetSchema.parse(await response.json());
    // No cache tag to invalidate here: a brand-new asset is not yet
    // referenced by any cached public loader. `tags.media(id)` exists for
    // the settings/home-block loaders that DO reference an existing asset by
    // id, and those call `updateTag` on their OWN save path (Task 6, 15).
    revalidatePath('/admin/media');
    return { ok: true, storageKey: asset.storageKey };
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
