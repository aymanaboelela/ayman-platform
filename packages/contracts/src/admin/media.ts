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

/** 200 MiB. A deck with embedded imagery, not a video file. */
export const MAX_DOCUMENT_BYTES = 200 * 1024 * 1024;
