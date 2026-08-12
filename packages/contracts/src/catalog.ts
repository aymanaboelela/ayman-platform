import { z } from '@ayman/contracts/zod';

/**
 * The PUBLIC read shapes. Anything absent here is absent from the wire — this
 * file is the allowlist the catalog serializer is tested against, which is why
 * it does not simply mirror the Prisma models. `status`, `priceCents`,
 * `instructorId`, `coverKey`-adjacent internals and every draft row stop here.
 */
/**
 * ⚠️ There is deliberately NO `videoExternalId` here, and adding one back is a
 * security regression, not a feature.
 *
 * It used to be present "for free previews only", which put a playable YouTube
 * id in an `@Public()` response — the public course page embedded it, and
 * `videoObjectJsonLd` announced it a second time in the same document. Anyone
 * could watch without ever having an account.
 * `2026-08-03-login-gated-content-design.md` §4.1 is the decision: no lesson
 * content of any kind reaches an anonymous caller, free or not. The id now
 * lives only behind `GET /api/lessons/:lessonId/player`, which requires a
 * session AND an active enrollment.
 *
 * The field is removed from this ALLOWLIST rather than filtered in
 * `CatalogService` on purpose: this file is what the serializer is typed
 * against, so re-adding the id to the wire is a compile error rather than a
 * one-line change nobody reviews.
 */
export const CatalogLessonSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  kind: z.enum(['video', 'quiz', 'attachment', 'text']),
  estimatedSeconds: z.number().int().min(0),
  /**
   * Still meaningful — it marks the lesson that leads the outline — but it no
   * longer implies "playable by strangers". Not a key to anything.
   */
  isFreePreview: z.boolean(),
  durationSeconds: z.number().int().min(0).nullable(),
  /**
   * مدارس عام / مدارس لغات. Public on purpose: it is a label a visitor needs
   * in order to tell whether an outline entry is meant for them, and it
   * unlocks nothing — unlike `videoExternalId` above, which is why that one is
   * absent and this one is not.
   */
  forGeneral: z.boolean(),
  forLanguages: z.boolean(),
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
  forGeneral: z.boolean(),
  forLanguages: z.boolean(),
  publishedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/**
 * The `?stream=` filter on the public list. `both` is not a value: a visitor
 * asking for عام wants every course a عام student can take, which includes the
 * ones that serve both — so the filter is a membership test, not an equality
 * one, and there is no third option to offer.
 */
export const CatalogStreamFilterSchema = z.enum(['general', 'languages']);
export type CatalogStreamFilter = z.infer<typeof CatalogStreamFilterSchema>;

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
