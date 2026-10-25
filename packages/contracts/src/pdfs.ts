import { z } from '@ayman/contracts/zod';

/**
 * «ملفات PDF» — the public downloads section.
 *
 * Every PDF has its own page (`/pdfs/:slug`) so it can be FOUND: a page with a
 * title, a description and a body is something a search engine indexes, a
 * bare `.pdf` link is not. That page is also the link that goes under a
 * YouTube video — one press and the file downloads, no account, no form.
 *
 * Ayman's stack only (`IS_AYMAN` on both sides): the API 404s the whole
 * surface elsewhere.
 *
 * The file itself is uploaded through the existing `/api/media/documents`
 * route (private `doc/…` key, 95 MB ceiling, magic-byte checked) and served
 * by `GET /api/pdfs/:slug/download`, which counts the download.
 */

/** Same rule as an article's slug (`NewsSlugSchema`), restated rather than
 *  imported: `news.ts` imports `PdfCardSchema` from here, and the cycle would
 *  leave one of the two `undefined` at load. Arabic slugs are fine. */
export const PdfSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .refine((value) => !/[/.\s]/.test(value), {
    message: 'الرابط ما ينفعش يحتوي على مسافة أو نقطة أو شرطة مائلة',
  });

export const PdfStatusSchema = z.enum(['draft', 'published']);

export const PDF_CATEGORIES = ['book', 'summary', 'revision', 'exam', 'notes', 'other'] as const;
export const PdfCategorySchema = z.enum(PDF_CATEGORIES);

/** «أولى» / «تانية» بكالوريا, or null for a PDF that belongs to both. */
export const PdfYearSchema = z.union([z.literal(1), z.literal(2)]).nullable();

/** The search-result snippet and the card's line — the same length rule as an
 *  article's excerpt, for the same reason: Google cuts at ~160. */
export const PdfDescriptionSchema = z.string().trim().min(20).max(160);

export const PdfTitleSchema = z.string().trim().min(4).max(120);

/** «عن الملف» — the indexed text under the download button. Markdown, like an
 *  article body. Optional: a PDF can ship with its description alone. */
export const PdfBodySchema = z.string().trim().max(20_000);

/** The `doc/xx/<uuid>.pdf` key `/api/media/documents` returned. Checked here
 *  so a PATCH cannot point a public download at someone's homework upload. */
export const PdfFileKeySchema = z
  .string()
  .trim()
  .regex(/^doc\/[0-9a-f]{2}\/[0-9a-f-]{36}\.pdf$/, { message: 'لازم يكون ملف PDF مرفوع' });

export const PdfListItemSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  category: PdfCategorySchema,
  year: PdfYearSchema,
  coverKey: z.string().nullable(),
  sizeBytes: z.number().int().min(0),
  pageCount: z.number().int().min(1).nullable(),
  downloads: z.number().int().min(0),
  publishedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const PdfDetailSchema = PdfListItemSchema.extend({
  body: z.string(),
  /** Up to four other published PDFs, same year first — the page's «كمان». */
  related: z.array(PdfListItemSchema),
});

export const PdfListSchema = z.object({ pdfs: z.array(PdfListItemSchema) });

export const AdminPdfRowSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  category: PdfCategorySchema,
  year: PdfYearSchema,
  status: PdfStatusSchema,
  sizeBytes: z.number().int().min(0),
  downloads: z.number().int().min(0),
  publishedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});

export const AdminPdfDetailSchema = AdminPdfRowSchema.extend({
  description: z.string(),
  body: z.string(),
  coverKey: z.string().nullable(),
  fileKey: z.string(),
  fileName: z.string(),
  pageCount: z.number().int().min(1).nullable(),
});

/**
 * ⚠️ No `.default()` anywhere in here. `PdfPatchSchema` is `.partial()` of it,
 * and a partial keeps defaults — a PATCH that only renamed the title would
 * have reset the category.
 */
export const PdfCreateSchema = z.object({
  slug: PdfSlugSchema,
  title: PdfTitleSchema,
  description: PdfDescriptionSchema,
  body: PdfBodySchema,
  category: PdfCategorySchema,
  year: PdfYearSchema,
  coverKey: z.string().trim().min(1).max(200).nullable(),
  fileKey: PdfFileKeySchema,
  fileName: z.string().trim().min(1).max(200),
  sizeBytes: z.number().int().min(1),
  pageCount: z.number().int().min(1).max(5000).nullable(),
});

export const PdfPatchSchema = PdfCreateSchema.partial();

export const PdfSetPublishedSchema = z.object({ isPublished: z.boolean() });

/** The download card an article carries when it links a PDF. */
export const PdfCardSchema = PdfListItemSchema.pick({
  slug: true,
  title: true,
  description: true,
  category: true,
  sizeBytes: true,
  pageCount: true,
  coverKey: true,
});

/** «٢٫٤ ميجا» — the size the card prints. */
export function pdfSizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} كيلو`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} ميجا`;
}

export type PdfCategory = z.infer<typeof PdfCategorySchema>;
export type PdfYear = z.infer<typeof PdfYearSchema>;
export type PdfListItem = z.infer<typeof PdfListItemSchema>;
export type PdfDetail = z.infer<typeof PdfDetailSchema>;
export type PdfList = z.infer<typeof PdfListSchema>;
export type AdminPdfRow = z.infer<typeof AdminPdfRowSchema>;
export type AdminPdfDetail = z.infer<typeof AdminPdfDetailSchema>;
export type PdfCreate = z.infer<typeof PdfCreateSchema>;
export type PdfPatch = z.infer<typeof PdfPatchSchema>;
export type PdfCard = z.infer<typeof PdfCardSchema>;
