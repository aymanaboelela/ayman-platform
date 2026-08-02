import { z } from 'zod';

/**
 * The allowlist is by MIME, and it is deliberately short.
 *
 * SVG is absent and must stay absent (A9): an SVG is a script-capable
 * document, not an image. Every "SVG sanitiser" is a moving target against a
 * parser differential, and the payoff — vector logos — is not worth an XSS
 * class. Logos and favicons upload as PNG or WebP.
 *
 * GIF is allowed but is re-encoded to animated WebP like everything else.
 */
export const ALLOWED_UPLOAD_MIME = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'image/gif',
] as const;
export const ALLOWED_UPLOAD_EXT = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif'] as const;

/** Enforced at the app AND (in production) at the reverse proxy. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Decompression-bomb ceiling handed to sharp's limitInputPixels (A14). */
export const MAX_INPUT_PIXELS = 50_000_000;

/** Everything we store is re-encoded to this. One output type, one Content-Type. */
export const OUTPUT_MIME = 'image/webp';
export const OUTPUT_EXT = 'webp';

export const MediaAssetSchema = z.object({
  id: z.string(),
  storageKey: z.string(),
  filename: z.string(),
  mime: z.literal(OUTPUT_MIME),
  sizeBytes: z.number().int().min(0),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  altAr: z.string().nullable(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type MediaAsset = z.infer<typeof MediaAssetSchema>;

/** A11: the ONLY key shape that may reach the filesystem. */
export const STORAGE_KEY_PATTERN = /^[0-9a-f]{2}\/[0-9a-f-]{36}\.webp$/;

/**
 * Document keys — `doc/<2 hex>/<uuid>.<ext>`, minted by `DocumentService`.
 *
 * A SECOND pattern rather than a loosened first one: `STORAGE_KEY_PATTERN` is
 * the shape the image pipeline produces, and widening it to also admit
 * documents would make both checks vaguer than either needs to be. Anchored at
 * both ends with a fixed extension set, so `..`, absolute paths and extra
 * segments are all unrepresentable — the traversal defence is unchanged.
 */
export const DOCUMENT_KEY_PATTERN =
  /^doc\/[0-9a-f]{2}\/[0-9a-f-]{36}\.(?:pdf|pptx|docx|xlsx)$/;

/** Either shape. `MediaStorage` implementations validate against this. */
export function isValidStorageKey(key: string): boolean {
  return STORAGE_KEY_PATTERN.test(key) || DOCUMENT_KEY_PATTERN.test(key);
}

export const MediaPatchSchema = z.object({ altAr: z.string().max(200).nullable() }).strict();

export type MediaPatch = z.infer<typeof MediaPatchSchema>;

// ── Documents ────────────────────────────────────────────────────────────
// Lesson materials (decks, PDFs) are NOT images and do not share the pipeline
// above. Gate 3 of that pipeline is a sharp RE-ENCODE to WebP — the step that
// destroys polyglots and strips EXIF — and it cannot exist for a PDF. See
// `DocumentService` for the four controls that compensate, and the spec
// §4.5 for why the difference is stated rather than papered over.

export const ALLOWED_DOCUMENT_EXT = ['pdf', 'pptx', 'docx', 'xlsx'] as const;

/**
 * Macro-ENABLED Office formats (`.pptm`, `.docm`, `.xlsm`) are absent by
 * design, not by oversight: they are the same container with an executable
 * payload slot. The four here cannot carry a macro at all.
 */
export const ALLOWED_DOCUMENT_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

/**
 * 95 MiB — and the number is chosen by CLOUDFLARE, not by us.
 *
 * Cloudflare rejects request bodies over 100 MB on the Free AND Pro plans
 * (Business is the first tier that raises it, to 200 MB). It returns 413 from
 * the edge, BEFORE the request reaches the origin — so an oversized upload
 * never appears in the application log at all. The admin sees an opaque
 * Cloudflare error page and there is nothing on the server to debug.
 *
 * A cap below that line means the refusal comes from US instead: the same
 * Arabic message every other validation failure produces, in the same place,
 * with an audit trail. A worse limit that fails legibly beats a better one
 * that fails invisibly.
 *
 * 95 rather than 100 because the multipart envelope (boundaries, headers, and
 * the filename) makes the request body larger than the file itself — a file at
 * exactly 100 MB is over the wire limit.
 *
 * Raising this past 95 requires a Business plan, or serving
 * `media.<domain>` without the Cloudflare proxy. See
 * `docs/runbooks/vps-setup.md`.
 */
export const MAX_DOCUMENT_BYTES = 95 * 1024 * 1024;
