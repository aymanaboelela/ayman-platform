import Link from 'next/link';
import { z } from 'zod';
import { Badge, Card, CardBody } from '@ayman/ui';
import { copy } from '@ayman/contracts';
import { apiGetAuthed } from '@/lib/api-server';

const AdminCourseListSchema = z.array(
  z.object({
    id: z.uuid(),
    slug: z.string(),
    title: z.string(),
    status: z.enum(['draft', 'published', 'archived']),
    year: z.number().int(),
    system: z.object({ nameAr: z.string() }),
    track: z.object({ labelAr: z.string() }).nullable(),
    subject: z.object({ nameAr: z.string() }),
    _count: z.object({ lessons: z.number().int() }),
  }),
);

const STATUS_LABEL = {
  draft: copy.admin.course.statusDraft,
  published: copy.admin.course.statusPublished,
  archived: copy.admin.course.statusArchived,
} as const;

export const metadata = { title: copy.admin.course.listTitle };

/**
 * Not cached. The admin list must always reflect the last write — a stale
 * dashboard is how an editor publishes the same course twice.
 */
export default async function AdminCoursesPage() {
  const courses = await apiGetAuthed('/api/admin/courses', AdminCourseListSchema);

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold">
          {copy.admin.course.listTitle}
        </h1>
        <Link
          href="/admin/courses/new"
          className="rounded-sm bg-accent px-4 py-2 font-medium text-[#1A1206]"
        >
          {copy.admin.course.new}
        </Link>
      </div>

      {courses.length === 0 ? (
        <p className="text-fg-muted">{copy.admin.course.empty}</p>
      ) : (
        <ul className="space-y-3">
          {courses.map((course) => (
            <li key={course.id}>
              <Card>
                <CardBody className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/courses/${course.id}`}
                      className="block truncate font-medium text-fg"
                    >
                      {course.title}
                    </Link>
                    <p className="mono mt-1 text-[length:var(--fs-mono-label)] text-fg-muted">
                      {course.slug} · {course.system.nameAr} · {course.year} ·{' '}
                      {course.subject.nameAr} · {course._count.lessons}{' '}
                      {copy.catalog.lessonCount}
                    </p>
                  </div>
                  {/* Amber for published, neutral otherwise. Green is reserved
                      for quiz correctness and never used decoratively. */}
                  <Badge tone={course.status === 'published' ? 'accent' : 'neutral'}>
                    {STATUS_LABEL[course.status]}
                  </Badge>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
