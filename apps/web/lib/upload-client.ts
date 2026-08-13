'use client';

import {
  MAX_AVATAR_BYTES,
  MAX_DOCUMENT_BYTES,
  MAX_UPLOAD_BYTES,
  MediaAssetSchema,
  type MediaAsset,
} from '@ayman/contracts/admin/media';
import { z } from 'zod';
import { CSRF_HEADER, readCsrfToken } from '@/lib/csrf';

/**
 * File uploads, sent from the BROWSER straight to the API.
 *
 * ## Why not a Server Action, which is what this replaced
 *
 * A Next Server Action buffers its whole payload in the server's memory before
 * the function body runs, so it is capped — `serverActions.bodySizeLimit`,
 * **1 MB by default**, and this project never set it. Every upload in the
 * admin went through one, which meant the real ceiling was 1 MB no matter what
 * the API or the screen said.
 *
 * Measured on the course cover field, 2026-08-08, same image at four sizes:
 *
 *     2 KB     → saved
 *     515 KB   → saved
 *     1,056 KB → nothing happened, no error anywhere
 *     3 MB     → nothing happened, no error anywhere
 *
 * The screen was promising 8 MB for an image and 200 MB for a deck. So a
 * course cover off a phone never saved, and «أضف مادة» — which only enables
 * once a document has uploaded — could never enable for a real lecture PDF.
 * Reported twice, as «لما بغير الصوره متعملتش» and «بيعمل لودنج وبعد مدة مش
 * بتظهر»; the earlier round of testing missed it because a small test PNG is
 * under 1 MB and passes.
 *
 * Raising `bodySizeLimit` to 95 MB was the one-line alternative and is worse:
 * Next would hold the whole file in memory, hand it to the action, which would
 * then re-send it to the API, which buffers it AGAIN for the magic-byte sniff.
 * Two copies of a 95 MB deck on a small VPS is an out-of-memory kill, and the
 * request has to cross the process boundary either way.
 *
 * Posting from the browser removes the middle hop entirely. `next.config.ts`
 * already rewrites `/api/:path*` to the API origin, so this is still a
 * same-origin request: the session cookie rides along, `__Host-` stays intact,
 * no CORS, and the CSRF convention is the same one every other client call
 * uses. The ceilings below are then the API's own, which is what the UI has
 * been claiming all along.
 *
 * ## Why XMLHttpRequest rather than fetch
 *
 * `fetch` cannot report UPLOAD progress — `ReadableStream` request bodies are
 * still not usable for this in Safari, and duplex streaming is not what a
 * progress bar needs anyway. XHR has had `upload.onprogress` forever. A 60 MB
 * deck over a phone connection is a minute of silence otherwise, and silence
 * during an upload is exactly the complaint this whole change is fixing.
 */

const DocumentUploadSchema = z.object({
  storageKey: z.string(),
  filename: z.string(),
  mime: z.string(),
  sizeBytes: z.number().int().positive(),
});

export type UploadedDocument = z.infer<typeof DocumentUploadSchema>;

/**
 * Why an upload did not happen — a closed set, so callers map it to Arabic
 * once instead of pattern-matching English server prose at each call site.
 *
 * `tooLarge` is raised HERE, before a single byte goes out, whenever the file
 * is over the endpoint's ceiling. Uploading 90 MB in order to be told it was
 * too big is a minute of someone's life and a minute of the server's.
 */
export type UploadFailure = 'tooLarge' | 'badType' | 'unreadable' | 'network' | 'failed';

export type UploadOutcome<T> = { ok: true; value: T } | { ok: false; reason: UploadFailure };

/** The API's English refusal → one of the reasons above. */
function classify(status: number, body: string): UploadFailure {
  // 413 can come from the API, from Nest's own body parser, or from a reverse
  // proxy that never let the request through — and a proxy's 413 is an HTML
  // page with no JSON message to read, which is why the STATUS is checked
  // before the body.
  if (status === 413) return 'tooLarge';

  let message = '';
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && 'message' in parsed) {
      message = String((parsed as { message: unknown }).message).toLowerCase();
    }
  } catch {
    // Not JSON — fall through to the generic reason rather than guessing from
    // an HTML error page.
  }

  if (message.includes('too large')) return 'tooLarge';
  if (message.includes('not allowed') || message.includes('unsupported')) return 'badType';
  if (message.includes('could not be processed') || message.includes('not an allowed document'))
    return 'unreadable';
  return 'failed';
}

function post(
  path: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<{ status: number; body: string } | null> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open('POST', path);
    // Same-origin through the `/api/:path*` rewrite, so the session cookie is
    // sent by default; this is belt-and-braces for the day someone points
    // NEXT_PUBLIC_MEDIA_ORIGIN somewhere else.
    request.withCredentials = true;
    /*
     * The presence of a custom header IS the CSRF control — a cross-site HTML
     * form cannot add one, and a cross-origin fetch that tries triggers a
     * preflight the API never answers. `CsrfGuard` also checks Origin and
     * Sec-Fetch-Site. The cookie value is echoed so the server could tighten
     * this into a real double-submit check later with no client change.
     */
    request.setRequestHeader(CSRF_HEADER, readCsrfToken() || 'browser-upload');

    if (onProgress) {
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded / event.total);
      };
    }

    // `null` means the request never completed — offline, DNS, a dropped
    // connection mid-upload. Distinct from a refusal, because the file may be
    // perfectly fine and worth retrying unchanged.
    request.onerror = () => resolve(null);
    request.onabort = () => resolve(null);
    request.ontimeout = () => resolve(null);
    request.onload = () => resolve({ status: request.status, body: request.responseText });

    const body = new FormData();
    body.set('file', file, file.name);
    request.send(body);
  });
}

async function upload<T>(
  path: string,
  file: File,
  maxBytes: number,
  parse: (json: unknown) => T,
  onProgress?: (fraction: number) => void,
): Promise<UploadOutcome<T>> {
  if (file.size > maxBytes) return { ok: false, reason: 'tooLarge' };

  const response = await post(path, file, onProgress);
  if (!response) return { ok: false, reason: 'network' };
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, reason: classify(response.status, response.body) };
  }

  try {
    return { ok: true, value: parse(JSON.parse(response.body)) };
  } catch {
    // A 2xx whose body is not the shape the contract promises is a real
    // failure, not a success to paper over — the caller would otherwise store
    // an undefined storage key.
    return { ok: false, reason: 'failed' };
  }
}

/**
 * An image for a cover, a poster or the media library. Re-encoded to WebP by
 * the API.
 *
 * Resolves the WHOLE asset, not just its storage key. `MediaKeyField` stores
 * the key (a course cover column holds one), but every settings slot stores
 * the asset ID — and a picker that has just uploaded an image needs to select
 * it without a second round trip to find out what it was called.
 */
export function uploadImage(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<UploadOutcome<MediaAsset>> {
  return upload('/api/media', file, MAX_UPLOAD_BYTES, (json) => MediaAssetSchema.parse(json), onProgress);
}

/**
 * Re-crop: new bytes for an asset that is already in the library.
 *
 * The asset ID survives, so every reference to it — a branding slot, the OG
 * image, a home block — follows the new crop with nothing to re-point. The
 * STORAGE KEY does not survive, which is why the parsed asset is handed back:
 * a caller rendering the old key would show the old crop from cache for as
 * long as `immutable` says it may.
 */
export function replaceImage(
  assetId: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<UploadOutcome<MediaAsset>> {
  return upload(
    `/api/admin/media/${encodeURIComponent(assetId)}/replace`,
    file,
    MAX_UPLOAD_BYTES,
    (json) => MediaAssetSchema.parse(json),
    onProgress,
  );
}

/**
 * The signed-in student's own profile photo.
 *
 * Its ceiling is `MAX_AVATAR_BYTES` (2 MB) — deliberately below the general
 * one, because this is the only upload path open to every account rather than
 * to the handful with `media:write`. That made the Server Action bug worse
 * here than anywhere: the window between 1 MB and 2 MB was photos the product
 * explicitly allows, refused with nothing on screen at all. A phone camera
 * lands in that window constantly.
 */
export function uploadAvatar(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<UploadOutcome<{ image: string }>> {
  return upload(
    '/api/profile/avatar',
    file,
    MAX_AVATAR_BYTES,
    (json) => z.object({ image: z.string() }).parse(json),
    onProgress,
  );
}

/** A lesson material: PDF, PowerPoint, Word or Excel. */
export function uploadDocument(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<UploadOutcome<UploadedDocument>> {
  return upload(
    '/api/media/documents',
    file,
    MAX_DOCUMENT_BYTES,
    (json) => DocumentUploadSchema.parse(json),
    onProgress,
  );
}
