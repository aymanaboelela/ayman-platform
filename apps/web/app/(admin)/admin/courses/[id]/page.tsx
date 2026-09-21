import { z } from 'zod';
import {
  CompletionModeSchema,
  CourseEmphasisSchema,
  LessonKindSchema,
  LessonResourceKindSchema,
} from '@ayman/contracts';
import { copy } from '@ayman/contracts/copy/admin';
import { AdminCourseMonthSchema, type AdminCourseMonth } from '@ayman/contracts/months';
import { VideoMirrorStatusSchema, VideoProviderSchema } from '@ayman/contracts/video';
import { getTaxonomyLiveOrNull, getTaxonomyOrNull } from '@/lib/taxonomy';
import { apiGetAuthed, apiGetAuthedOrNotFound } from '@/lib/api-server';
import { CourseEditor } from '@/components/admin/course/course-editor';

const AdminCourseDetailSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  description: z.string().nullable(),
  systemId: z.uuid(),
  year: z.number().int(),
  trackId: z.uuid().nullable(),
  subjectId: z.uuid(),
  coverKey: z.string().nullable(),
  requiresGrant: z.boolean(),
  emphasis: CourseEmphasisSchema.nullable(),
  emphasisNote: z.string().nullable(),
  comingSoonNote: z.string().nullable(),
  /** «ميعاد المحاضرة» — free text, `null` when unset. Must be parsed here or
   *  the editor's draft opens empty and its next autosave clears the column. */
  scheduleNote: z.string().nullable(),
  /** «جروب الدفعة» — same reason as the line above: parsed here or the
   *  editor's field opens empty and its next autosave clears the column. */
  whatsappGroupUrl: z.string().nullable(),
  contentComplete: z.boolean(),
  monthlyPriceCents: z.number().int().nullable(),
  /** ⚠️ HISTORY ONLY. Nothing on this screen renders it any more — «٣ شهور»
   *  is off the shelf and `course-form.tsx` has no field for it. Parsed
   *  because the payload still carries it: a schema that describes the wire is
   *  how the next reader learns the column is still there. */
  quarterlyPriceCents: z.number().int().nullable(),
  yearlyPriceCents: z.number().int().nullable(),
  bookTitle: z.string().nullable(),
  bookPriceCents: z.number().int().nullable(),
  forGeneral: z.boolean(),
  forLanguages: z.boolean(),
  status: z.enum(['draft', 'published', 'archived']),
  examLessonId: z.uuid().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  // الترم الأول / الترم الثاني.
  terms: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      position: z.number().int(),
      isOpen: z.boolean(),
      priceCents: z.number().int().nullable(),
    }),
  ),
  sections: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      summary: z.string().nullable(),
      position: z.number().int(),
      isPublished: z.boolean(),
      /** Which term this section belongs to — `null` = not assigned. */
      termId: z.uuid().nullable(),
      lessons: z.array(
        z.object({
          id: z.uuid(),
          title: z.string(),
          kind: LessonKindSchema,
          position: z.number().int(),
          isPublished: z.boolean(),
          isFreePreview: z.boolean(),
          forGeneral: z.boolean(),
          forLanguages: z.boolean(),
          estimatedSeconds: z.number().int(),
          completionMode: CompletionModeSchema,
          completionMinViewSeconds: z.number().int().nullable(),
          // Decimal(6,3) on the wire — a JSON number here, not a string.
          completionPassGrade: z.coerce.number().nullable(),
          /* «ينزل الساعة ٨» and the after-the-lecture summary. `.catch(null)`
             on both, not `.nullable()` alone: this page is served by whichever
             API container answers, and during a rolling deploy that is briefly
             one that predates the columns. A missing field must degrade to "no
             schedule / no summary" rather than fail the parse and blank the
             whole course editor. */
          publishAt: z.string().nullable().catch(null),
          description: z.string().nullable().catch(null),
          /** «الشهر: ٢ — وكمان لشهر ٣». The lesson panel's month control
           *  prefills from this; `PUT /admin/lessons/:id/months` rewrites the
           *  WHOLE set, so a control that opened empty over an existing tag
           *  would clear it on the next save — and quietly take a published
           *  lecture out of the month somebody paid for.
           *
           *  `.catch([])` for the same reason `publishAt` above has one: during
           *  a rolling deploy this page is served by whichever API container
           *  answers, and for a minute that is one predating the table. «مفيش
           *  شهور» degrades to a control the instructor can re-set; a failed
           *  parse blanks the whole course editor. */
          months: z
            .array(z.object({ monthId: z.uuid(), isPrimary: z.boolean() }))
            .catch([]),
          video: z
            .object({
              externalId: z.string(),
              durationSeconds: z.number().int(),
              // The thumbnail. Present here so the video form can prefill it —
              // it was a column the admin could never see, let alone set.
              posterKey: z.string().nullable(),
              /*
               * «الرفع المباشر». Which source the lecture came from decides
               * which form the panel shows — an uploaded lecture has no URL
               * to prefill and prefilling `https://youtu.be/<32 hex>` is a
               * link to nothing.
               */
              provider: VideoProviderSchema,
              /** Whether our copy is ready, still encoding, or failed. */
              mirrorStatus: VideoMirrorStatusSchema,
              /** The instructor's own filename, shown back to them. */
              sourceName: z.string().nullable(),
            })
            .nullable(),
          // Prefills the body editor. See `findForAdmin` for why its absence
          // was a data-loss bug rather than a missing convenience.
          text: z.object({ bodyHtml: z.string() }).nullable(),
          // `progress` counts students, one row each — the delete
          // confirmation names the number when it is not zero.
          _count: z.object({
            progress: z.number().int(),
            /** «فيه X مستنيين» on the homework block — a filtered relation
             *  count, so the panel needs no second request to know there is
             *  work waiting on this lecture. */
            homeworkSubmissions: z.number().int(),
          }),
          /** الواجب — the questions he set, so the field opens filled rather
           *  than blank over content the next autosave would overwrite. */
          homework: z
            .object({
              body: z.string(),
              maxImages: z.number().int(),
              isPublished: z.boolean(),
            })
            .nullable(),
          quiz: z
            .object({
              id: z.uuid(),
              isPublished: z.boolean(),
              _count: z.object({ slots: z.number().int() }),
            })
            .nullable(),
          // Note what is absent: `storageKey`. The admin panel never needs it,
          // and a key that is not in a payload is a key that cannot leak from
          // one.
          resources: z.array(
            z.object({
              id: z.uuid(),
              kind: LessonResourceKindSchema,
              title: z.string(),
              description: z.string().nullable(),
              filename: z.string().nullable(),
              linkUrl: z.string().nullable(),
              videoExternalId: z.string().nullable(),
            }),
          ),
        }),
      ),
    }),
  ),
});

export type AdminCourseDetail = z.infer<typeof AdminCourseDetailSchema>;

/**
 * شهور المنهج, with the two counts the panel is built around.
 *
 * A SECOND request rather than a field on the course payload, because the two
 * numbers on each row — live subscribers and published lectures — are
 * aggregates `findForAdmin` has no business computing on a query that already
 * walks every lesson of every section. `CourseMonthService.list` answers the
 * whole list in four queries however many months there are.
 *
 * `null` means «معرفناش نقراهم» and is NOT the same as «مفيش شهور». During a
 * rolling deploy this route 404s on the container that predates it, and an
 * empty array there would make `MonthPanel` state, in Arabic, that this course
 * still sells the old thirty-day month — a sentence that is false and that the
 * instructor would act on. So a failure renders NO panel at all, which says
 * nothing rather than something untrue, and the next load restores it.
 */
async function monthsOrNull(courseId: string): Promise<AdminCourseMonth[] | null> {
  try {
    return await apiGetAuthed(
      `/api/admin/courses/${courseId}/months`,
      AdminCourseMonthSchema.array(),
    );
  } catch {
    return null;
  }
}

export const metadata = { title: copy.admin.course.edit };

export default async function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  /* Cache first, live only on a miss — the shape `/onboarding` uses, and for the
     same reason it uses it: taxonomy is load-bearing on this screen (the form's
     system / year / track selects are built from it), so a cached `null` cannot
     be shrugged off the way `/admin/students` shrugs off an empty filter.
     What the cache buys even so is the common case: a hit makes no API call at
     all, which is the whole point after a restart emptied the shared
     rate-limit bucket and the bare `apiGet` here would have thrown. See
     `lib/taxonomy.ts` and `admin/students/page.tsx`. */
  const [course, taxonomy, months] = await Promise.all([
    apiGetAuthedOrNotFound(`/api/admin/courses/${id}`, AdminCourseDetailSchema),
    getTaxonomyOrNull().then((t) => t ?? getTaxonomyLiveOrNull()),
    monthsOrNull(id),
  ]);
  if (!taxonomy) throw new Error('GET /api/taxonomy is unavailable');

  return <CourseEditor course={course} taxonomy={taxonomy} months={months} />;
}
