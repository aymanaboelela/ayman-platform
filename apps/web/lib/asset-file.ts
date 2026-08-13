'use client';

import { OUTPUT_MIME } from '@ayman/contracts/admin/media';
import { mediaUrl } from '@ayman/ui/branding';

/**
 * Fetch an asset that is already in the library back as a `File`, so the
 * cropper can reopen it.
 *
 * ## Why this has to exist
 *
 * `<CoverCropper>` works on a `File`, because it was written for the moment
 * BEFORE an upload — the instructor picks a picture and frames it on the way
 * in. Re-cropping something already stored is the same operation with a
 * different source: the only copy of the picture is on the media origin, and
 * «أعدل الصورة بعد ما أضفتها» has to work without asking the instructor to
 * find the original on their machine again. Often they can't; it was taken on
 * a phone six months ago.
 *
 * ## Why a `fetch` and not an `<img>`
 *
 * An `<img>` would decode without any CORS negotiation, but drawing one into a
 * canvas TAINTS it, and a tainted canvas throws on `toBlob()` — after the crop
 * is finished, not before it starts. The failure would arrive at the worst
 * possible moment and say nothing useful. `GET /media/:prefix/:name` sends
 * `Access-Control-Allow-Origin: *` for exactly this call, so the bytes arrive
 * as bytes and every later step is ordinary.
 *
 * Resolves `null` on any failure — offline, a 404 from an asset whose row
 * outlived its object, a CORS header that went missing. The caller shows
 * «مقدرناش نجيب الصورة» and leaves the stored image exactly as it was, which
 * is the right outcome for every one of those.
 */
export async function fileFromStorageKey(
  storageKey: string,
  filename: string,
): Promise<File | null> {
  try {
    const response = await fetch(mediaUrl(storageKey));
    if (!response.ok) return null;

    const blob = await response.blob();
    // Everything the library stores has been re-encoded to WebP by the API, so
    // the extension is fixed rather than parsed off `filename` — which is the
    // ORIGINAL upload's name and may still say `.jpg`.
    const stem = filename.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${stem}.webp`, { type: OUTPUT_MIME });
  } catch {
    return null;
  }
}
