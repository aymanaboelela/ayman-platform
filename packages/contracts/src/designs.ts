import { z } from '@ayman/contracts/zod';

/**
 * «ستوديو التصميم» — the graphic designer's workspace.
 *
 * A designer uploads finished artwork (lecture thumbnails, covers, banners)
 * into folders; the instructor browses the same folders from the dashboard,
 * downloads the originals, and turns any one of them into a lecture's cover.
 *
 * ## Why this is not the media library
 *
 * `media_assets` is the library of images the SITE serves: every row has been
 * resized to 1600px at q82 WebP and lives under a public, `immutable`,
 * two-segment key anybody holding it can fetch. A designer's master is the
 * opposite on both counts — it must keep every pixel it arrived with, and it
 * is work-in-progress nobody outside the team should see. So the masters live
 * under the private `design/` prefix (three segments: the public serve route
 * cannot address them, same trick as `doc/` and `msg/`) and only become a
 * library image when the instructor publishes one.
 *
 * No relative imports in this file, for the same reason as `auth.ts`: the API
 * loads it at runtime through the `@ayman/contracts/designs` subpath.
 */

/**
 * What a designer may upload. Raster exports only — the formats a design tool
 * writes for delivery.
 *
 * ⚠️ SVG, PSD, AI, PDF and TIFF are absent on purpose, and the reason is the
 * same for all of them: every byte stored here has been DECODED AND RE-ENCODED
 * by sharp (see `DesignsService`), which is what destroys a polyglot and strips
 * every metadata block. SVG cannot be re-encoded without rasterising it (and is
 * a script-capable document besides), PSD/AI/PDF are not something sharp can
 * open at all, and TIFF's parser has the longest CVE history of any image
 * format while adding nothing a PNG does not carry. A layered source file is
 * the designer's to keep; the platform takes the export.
 */
export const DESIGN_UPLOAD_EXT = ['png', 'jpg', 'jpeg', 'webp', 'avif'] as const;
export const DESIGN_UPLOAD_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'] as const;

/**
 * 60 MB a file. A 4K PNG with an alpha channel is ~20–30 MB; an 8K one is
 * bigger. Under Cloudflare's 100 MB body ceiling with room for the multipart
 * envelope — see `MAX_DOCUMENT_BYTES` for why the limit has to be OURS and not
 * the edge's.
 */
export const MAX_DESIGN_BYTES = 60 * 1024 * 1024;

/**
 * The decompression-bomb ceiling, in pixels. 64 MP holds an 8K frame
 * (7680×4320 = 33 MP) with room, and stops a 1 KB PNG that claims to be
 * 100 000 × 100 000 before libvips allocates anything.
 */
export const MAX_DESIGN_PIXELS = 64_000_000;

/**
 * The whole studio, all folders together. The media volume sits on the same
 * disk as the database, and a disk that fills takes the platform down with it,
 * so the studio refuses before that rather than after. Shown on the studio
 * screen as a meter, so «المساحة خلصت» is never a surprise.
 */
export const DESIGN_QUOTA_BYTES = 15 * 1024 * 1024 * 1024;

/** Display names — a folder's and a picture's. */
export const DESIGN_NAME_MAX = 120;

/**
 * A folder's colour — a closed set, drawn from the chart palette so every one
 * is distinguishable from its neighbours in both modes and under colour-blind
 * simulation (`packages/ui/src/tokens/viz.css`). A free hex here would be a
 * colour nobody measured.
 */
export const DESIGN_FOLDER_COLORS = ['amber', 'teal', 'violet', 'rose', 'blue', 'green'] as const;
export type DesignFolderColor = (typeof DESIGN_FOLDER_COLORS)[number];

/**
 * Display text, cleaned the way a filename has to be before it is shown.
 *
 * Bidi controls (U+202A–E, U+2066–9) and zero-width characters are stripped:
 * a name like «غلاف‮gnp.exe» renders as something it is not, and the instructor
 * reads these names to decide what to publish. Control characters go for the
 * same reason. What is left is trimmed and collapsed.
 */
const INVISIBLE = /[\u0000-\u001f\u007f​-‏‪-‮⁠-⁩﻿]/g;

export function cleanDesignName(raw: string): string {
  return raw.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
}

const DesignNameSchema = z
  .string()
  .transform(cleanDesignName)
  .pipe(z.string().min(1, 'اكتب اسم').max(DESIGN_NAME_MAX, 'الاسم طويل'));

export const DesignFolderCreateSchema = z
  .object({
    name: DesignNameSchema,
    color: z.enum(DESIGN_FOLDER_COLORS).default('amber'),
  })
  .strict();
export type DesignFolderCreate = z.input<typeof DesignFolderCreateSchema>;

export const DesignFolderPatchSchema = z
  .object({
    name: DesignNameSchema.optional(),
    color: z.enum(DESIGN_FOLDER_COLORS).optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.color !== undefined, 'nothing to change');
export type DesignFolderPatch = z.input<typeof DesignFolderPatchSchema>;

export const DesignAssetPatchSchema = z
  .object({
    name: DesignNameSchema.optional(),
    /** Moving a picture to another folder. */
    folderId: z.uuid().optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.folderId !== undefined, 'nothing to change');
export type DesignAssetPatch = z.input<typeof DesignAssetPatchSchema>;

/**
 * How a published picture will be SHOWN — the same three frames
 * `MediaKeyField` crops to (16/9 cover, round avatar, 3/4 book jacket), plus
 * `original` for a slot that takes the picture as drawn.
 */
export const DESIGN_PUBLISH_SHAPES = ['cover', 'round', 'book', 'original'] as const;
export type DesignPublishShape = (typeof DESIGN_PUBLISH_SHAPES)[number];

export const DesignPublishSchema = z
  .object({ shape: z.enum(DESIGN_PUBLISH_SHAPES).default('cover') })
  .strict();
export type DesignPublish = z.input<typeof DesignPublishSchema>;

/**
 * The longest edge a published copy keeps. 2560 is a 1280-CSS-px player on a
 * 2× screen — the biggest box any lecture cover is painted into — so nothing
 * on the site is ever upscaled from it, while a 4K master does not ship 4K
 * to a phone.
 */
export const DESIGN_PUBLISH_MAX_EDGE = 2560;

export const DesignFormatSchema = z.enum(['png', 'jpg']);
export type DesignFormat = z.infer<typeof DesignFormatSchema>;

export const DesignAssetSchema = z.object({
  id: z.string(),
  folderId: z.string(),
  name: z.string(),
  format: DesignFormatSchema,
  width: z.number().int(),
  height: z.number().int(),
  sizeBytes: z.number().int(),
  /** Bumped on every «استبدال», so a cached preview URL changes with it. */
  version: z.number().int(),
  uploadedByName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DesignAsset = z.infer<typeof DesignAssetSchema>;

export const DesignFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.enum(DESIGN_FOLDER_COLORS),
  assetCount: z.number().int(),
  sizeBytes: z.number().int(),
  /** The newest picture's id and version — the folder's own thumbnail. */
  cover: z.object({ id: z.string(), version: z.number().int() }).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DesignFolder = z.infer<typeof DesignFolderSchema>;

export const DesignStudioSchema = z.object({
  folders: z.array(DesignFolderSchema),
  usedBytes: z.number().int(),
  quotaBytes: z.number().int(),
});
export type DesignStudio = z.infer<typeof DesignStudioSchema>;

export const DesignFolderDetailSchema = z.object({
  folder: DesignFolderSchema,
  assets: z.array(DesignAssetSchema),
});
export type DesignFolderDetail = z.infer<typeof DesignFolderDetailSchema>;

/** Same-origin paths through the `/api/:path*` rewrite — the cookie rides along. */
export function designPreviewPath(asset: { id: string; version: number }): string {
  return `/api/designs/assets/${encodeURIComponent(asset.id)}/preview?v=${asset.version}`;
}

export function designDownloadPath(asset: { id: string; version: number }): string {
  return `/api/designs/assets/${encodeURIComponent(asset.id)}/download?v=${asset.version}`;
}

/** «1.4 ميجا» / «820 كيلو» — sizes as a designer reads them. */
export function designSizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} جيجا`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} ميجا`;
  return `${Math.max(1, Math.round(bytes / 1024))} كيلو`;
}
