import { z } from '@ayman/contracts/zod';

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

/**
 * Avatars, uploaded by STUDENTS rather than by staff, get their own two rules.
 *
 * `MAX_AVATAR_BYTES` is well under the general cap: this is the one upload
 * path open to every account on the platform rather than to the handful with
 * `media:write`, so the cheapest way to make a flood expensive is to make each
 * request small. A profile photo needing more than 2 MB is a photo that is
 * about to be resized to 512px anyway.
 *
 * `AVATAR_SIZE_PX` is applied as a `cover` resize BEFORE the WebP encode, so
 * what lands on disk is what gets served. Storing a 4000×3000 original and
 * letting each call site crop it is how the same face ends up framed
 * differently in the rail, the account menu and the profile header.
 */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const AVATAR_SIZE_PX = 512;

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

/**
 * Conversation attachment keys — `msg/<2 hex>/<uuid>.<ext>`, minted by
 * `ConversationAttachmentService`.
 *
 * ## Why a THIRD prefix rather than reusing the first two
 *
 * The prefix is the access-control boundary, not decoration. `GET
 * /media/:prefix/:name` — the public, `@Public()`, `immutable` route — binds
 * exactly TWO path segments, so a three-segment key is structurally
 * unreachable through it. `doc/` uses that fact already; `msg/` uses it for
 * the same reason and one more:
 *
 *   · an image posted into a private conversation must not be readable by
 *     anyone holding the key, the way a course cover deliberately is. Storing
 *     it under the image pipeline's two-segment key would publish it;
 *   · it must not appear in the media LIBRARY either. `GET /admin/media` lists
 *     `media_assets`, and a term of photographs sent to individual students
 *     buried in the screen he picks course covers from is a worse library for
 *     no gain. These keys have no `media_assets` row at all, exactly like
 *     documents.
 *
 * Both extensions are here because one prefix carries both kinds: images
 * arrive re-encoded to `.webp` by the same sharp gate everything else passes,
 * documents keep the extension detected from their magic bytes.
 */
export const CONVERSATION_KEY_PATTERN =
  /^msg\/[0-9a-f]{2}\/[0-9a-f-]{36}\.(?:webp|pdf|pptx|docx|xlsx)$/;

/**
 * Payment proof keys — `payment-proof/<2 hex>/<uuid>.webp`, minted by
 * `PaymentsService.uploadScreenshot` via `MediaService.uploadPrivateImage`.
 * Same shape as `CONVERSATION_KEY_PATTERN` (a private, three-segment image
 * key `GET /media/:prefix/:name` cannot reach) but images only — a payment
 * screenshot is never a document. Forgetting this pattern here means every
 * upload passes `gateAndEncode` and then fails at `LocalDiskStorage.put`
 * with "invalid storage key", which is exactly what happened: the pipeline
 * shipped with `payment-proof/` allowed nowhere in this allowlist, so every
 * screenshot upload 500'd from the first real submission on.
 */
export const PAYMENT_PROOF_KEY_PATTERN = /^payment-proof\/[0-9a-f]{2}\/[0-9a-f-]{36}\.webp$/;

/** Any of the three shapes. `MediaStorage` implementations validate against this. */
export function isValidStorageKey(key: string): boolean {
  return (
    STORAGE_KEY_PATTERN.test(key) ||
    DOCUMENT_KEY_PATTERN.test(key) ||
    CONVERSATION_KEY_PATTERN.test(key) ||
    PAYMENT_PROOF_KEY_PATTERN.test(key)
  );
}

/**
 * The mime a stored key is served as — derived from the extension WE chose,
 * never from anything an uploader said.
 *
 * The extension is not a hint here: every pipeline picks it from the detected
 * type (sharp's output for an image, `EXT_FOR_MIME` for a document), so the
 * key is the only record of what the bytes are that cannot have been forged.
 * That is why a conversation attachment stores no `mime` column — a second
 * copy could only ever disagree.
 */
export const MIME_FOR_EXT: Record<string, string> = {
  webp: OUTPUT_MIME,
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** `webp` → an image the thread renders inline; anything else → a file card. */
export function mimeForStorageKey(key: string): string | null {
  const extension = key.split('.').pop()?.toLowerCase() ?? '';
  return MIME_FOR_EXT[extension] ?? null;
}

export const MediaPatchSchema = z.object({ altAr: z.string().max(200).nullable() }).strict();

export type MediaPatch = z.infer<typeof MediaPatchSchema>;

// ── Permanent delete ─────────────────────────────────────────────────────

/**
 * The places an asset id can be referenced FROM.
 *
 * `media_assets` has no inbound foreign key anywhere in the schema — every
 * reference to an asset is a plain string sitting in a jsonb blob
 * (`site_settings.data`, `home_blocks.data`). Postgres therefore cannot
 * refuse a delete that would break something, which is exactly why this list
 * is computed and shown before the permanent delete is allowed to proceed.
 *
 * Kinds, not sentences: user-facing Arabic lives in `@ayman/contracts/copy`
 * (Global Constraint 4), and the admin client maps each kind to its label.
 */
export const MEDIA_USAGE_KINDS = [
  'brandingLogoLight',
  'brandingLogoDark',
  'brandingFavicon',
  'seoOgImage',
  'homeBlock',
] as const;

export const MediaUsageKindSchema = z.enum(MEDIA_USAGE_KINDS);
export type MediaUsageKind = z.infer<typeof MediaUsageKindSchema>;

/**
 * `usedBy` is empty for an asset nothing points at — the ordinary case, and
 * the one where the confirm dialog only has to say «مش هتترجع».
 */
export const MediaUsageSchema = z.object({ usedBy: z.array(MediaUsageKindSchema) }).strict();

export type MediaUsage = z.infer<typeof MediaUsageSchema>;

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
