import { z } from 'zod';
import { LessonKindSchema, LessonResourceKindSchema, TaxonomySchema, copy } from '@ayman/contracts';
import { apiGet } from '@/lib/api';
import { apiGetAuthed } from '@/lib/api-server';
import { CourseEditor } from '@/components/admin/course-editor';

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
  status: z.enum(['draft', 'published', 'archived']),
  publishedAt: z.iso.datetime().nullable(),
  sections: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      summary: z.string().nullable(),
      position: z.number().int(),
      isPublished: z.boolean(),
      lessons: z.array(
        z.object({
          id: z.uuid(),
          title: z.string(),
          kind: LessonKindSchema,
          position: z.number().int(),
          isPublished: z.boolean(),
          isFreePreview: z.boolean(),
          estimatedSeconds: z.number().int(),
          video: z.object({ externalId: z.string(), durationSeconds: z.number().int() }).nullable(),
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

export const metadata = { title: copy.admin.course.edit };

export default async function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [course, taxonomy] = await Promise.all([
    apiGetAuthed(`/api/admin/courses/${id}`, AdminCourseDetailSchema),
    apiGet('/api/taxonomy', TaxonomySchema),
  ]);

  return <CourseEditor course={course} taxonomy={taxonomy} />;
}
