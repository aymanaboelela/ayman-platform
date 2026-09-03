import { z } from '@ayman/contracts/zod';
import { CourseEmphasisSchema } from '@ayman/contracts/content';

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
  /**
   * اكتمل نزول المحتوى — the instructor's own statement that the syllabus is
   * fully uploaded, NOT anything derived from the lesson count.
   *
   * Every «خلصت الكورس» on the platform used to mean `clearedLessons ===
   * totalLessons`, and `totalLessons` is only what has been published so far.
   * A student who watched the one lecture of a course still being recorded was
   * told they had finished it. So the word is gated on this, and a course that
   * is still filling up says «خلّصت اللي نزل» instead — true either way.
   *
   * ⚠️ Never an access decision, and it does not move the exam gate: the gate
   * asks whether the student cleared the lectures that EXIST, which is a
   * different question and stays answered the same way.
   */
  contentComplete: z.boolean(),
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
  /**
   * The card's badge and its one-line note. Both nullable and both purely
   * presentational — see `CourseEmphasis` in schema.prisma. A client that
   * ignores them renders exactly the catalog it rendered before.
   */
  emphasis: CourseEmphasisSchema.nullable(),
  emphasisNote: z.string().nullable(),
  /**
   * EGP cents, `null` when that plan is not for sale — public on purpose, so
   * a visitor with no session can see what a course costs before signing up.
   * Never used to decide access; see `Course.monthlyPriceCents`'s own note.
   */
  monthlyPriceCents: z.number().int().nullable(),
  quarterlyPriceCents: z.number().int().nullable(),
  /** EGP cents, `null` when this plan is not for sale — a full-year
   *  subscription, same public-pricing reasoning as the two above. */
  yearlyPriceCents: z.number().int().nullable(),
  /**
   * الكتاب الورقي — `null` when this course has no printed textbook to
   * order, which is what gates «اطلب الكتاب» everywhere it can appear: the
   * public course page, and the signed-in dashboard's `EnrolledCourseCard`
   * (see `EnrolledCourse` in `progress.ts`, which mirrors this same pair).
   * Public on the LIST too, not just the detail read, for the same reason
   * the subscription prices above are: a visitor browsing the catalog
   * should see what a book costs before ever opening the course. Independent
   * of `monthlyPriceCents`/etc — a free course can still sell a book.
   */
  bookTitle: z.string().nullable(),
  bookPriceCents: z.number().int().nullable(),
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

/**
 * الترم الأول / الترم الثاني — a THIRD purchase option alongside
 * `monthlyPriceCents`/`quarterlyPriceCents`, public for the same reason those
 * two are: a visitor with no session can see what a term costs before
 * signing up. Only OPEN, PRICED terms are ever in this list — see
 * `CatalogService.findBySlug`'s own query filter; a closed or unpriced term
 * is not for sale and has no reason to appear on a public page.
 */
export const CatalogCourseTermSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  priceCents: z.number().int(),
});
export type CatalogCourseTerm = z.infer<typeof CatalogCourseTermSchema>;

export const CatalogCourseDetailSchema = CatalogCourseSchema.extend({
  description: z.string().nullable(),
  terms: z.array(CatalogCourseTermSchema),
  sections: z.array(CatalogSectionSchema),
  /**
   * The admin's own «لسه هننزل قريبًا» wording — `null` when they have not set
   * one, which is most courses. The page only renders this (or the platform's
   * stock fallback) while `lessonCount` is `0`; a non-empty course carries
   * whatever an admin typed here too, but nothing reads it.
   */
  comingSoonNote: z.string().nullable(),
});

/**
 * Zero real lectures published yet — the same rule
 * `DashboardService`/`CourseProgressService`/`CatalogService` already apply
 * server-side to produce `lessonCount`/`totalLessons`
 * (`isPublished && section.isPublished && kind != 'quiz'`, PR #232).
 *
 * A course CAN be published with no lecture at all — `CourseService.setStatus`
 * only requires one published lesson of ANY kind, which a lone quiz (an exam
 * scaffold, say) satisfies — so "published" alone never implied "has
 * something to watch". This is the one place that turns the already-correct
 * count into the display decision, so the course page, the enrolled-course
 * card and the library card cannot each invent their own threshold.
 */
export function isComingSoon(realLectureCount: number): boolean {
  return realLectureCount === 0;
}

export const CatalogListSchema = z.object({
  courses: z.array(CatalogCourseSchema),
  total: z.number().int().min(0),
});

export type CatalogLesson = z.infer<typeof CatalogLessonSchema>;
export type CatalogSection = z.infer<typeof CatalogSectionSchema>;
export type CatalogCourse = z.infer<typeof CatalogCourseSchema>;
export type CatalogCourseDetail = z.infer<typeof CatalogCourseDetailSchema>;
export type CatalogList = z.infer<typeof CatalogListSchema>;
