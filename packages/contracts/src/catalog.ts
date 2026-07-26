import { z } from 'zod';

/**
 * The PUBLIC read shapes. Anything absent here is absent from the wire — this
 * file is the allowlist the catalog serializer is tested against, which is why
 * it does not simply mirror the Prisma models. `status`, `priceCents`,
 * `instructorId`, `coverKey`-adjacent internals and every draft row stop here.
 */
export const CatalogLessonSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  kind: z.enum(['video', 'quiz', 'attachment', 'text']),
  estimatedSeconds: z.number().int().min(0),
  isFreePreview: z.boolean(),
  /** Present only for video lessons that are free previews. Never a URL. */
  videoExternalId: z.string().regex(/^[A-Za-z0-9_-]{11}$/).nullable(),
  durationSeconds: z.number().int().min(0).nullable(),
});

export const CatalogSectionSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  summary: z.string().nullable(),
  lessons: z.array(CatalogLessonSchema),
});

export const CatalogCourseSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  systemSlug: z.string(),
  systemNameAr: z.string(),
  year: z.number().int().min(1).max(3),
  trackLabelAr: z.string().nullable(),
  subjectNameAr: z.string(),
  coverKey: z.string().nullable(),
  lessonCount: z.number().int().min(0),
  totalSeconds: z.number().int().min(0),
  publishedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const CatalogCourseDetailSchema = CatalogCourseSchema.extend({
  description: z.string().nullable(),
  sections: z.array(CatalogSectionSchema),
});

export const CatalogListSchema = z.object({
  courses: z.array(CatalogCourseSchema),
  total: z.number().int().min(0),
});

export type CatalogLesson = z.infer<typeof CatalogLessonSchema>;
export type CatalogSection = z.infer<typeof CatalogSectionSchema>;
export type CatalogCourse = z.infer<typeof CatalogCourseSchema>;
export type CatalogCourseDetail = z.infer<typeof CatalogCourseDetailSchema>;
export type CatalogList = z.infer<typeof CatalogListSchema>;
