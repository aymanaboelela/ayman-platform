import Link from 'next/link';
import { AdminGrantRowSchema, AdminStudentDetailSchema } from '@ayman/contracts/admin/students';
import { z } from 'zod';
import { TaxonomySchema, copy } from '@ayman/contracts';
import { apiGet } from '@/lib/api';
import { adminGet } from '@/lib/admin-api';
import { StudentDetailForm } from './student-detail-form';
import { RoleChangeSection } from './role-change-section';
import { CourseAccessSection } from './course-access-section';

export const metadata = { title: copy.admin.students.detailTitle };

/**
 * Uncached (`adminGet`), same reasoning as the list: an editor must never
 * see a stale role or a stale profile field.
 */
export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  /*
   * Four independent reads, issued together.
   *
   * `grants` and the course list are for `<CourseAccessSection>`: which closed
   * courses exist, and which of them this student already has. The course list
   * is filtered to CLOSED ones here rather than in the component — a grant on
   * an open course is a no-op, so offering one would be a control that does
   * nothing.
   */
  const [student, taxonomy, grants, courses] = await Promise.all([
    adminGet(`/api/admin/students/${userId}`, AdminStudentDetailSchema),
    apiGet('/api/taxonomy', TaxonomySchema),
    adminGet(`/api/admin/students/${userId}/grants`, z.array(AdminGrantRowSchema)),
    adminGet(
      '/api/admin/courses',
      z.array(z.object({ id: z.string(), title: z.string(), requiresGrant: z.boolean() })),
    ),
  ]);

  const closedCourses = courses
    .filter((course) => course.requiresGrant)
    .map((course) => ({ id: course.id, title: course.title }));

  const governorateOptions = taxonomy.governorates
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((g) => ({ value: g.code, label: g.nameAr }));

  return (
    <>
      <Link
        href="/admin/students"
        className="mb-4 inline-block text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
      >
        {'< '}
        {copy.admin.students.backToList}
      </Link>

      <h1 className="mb-4 text-[length:var(--fs-title-2)] font-semibold text-fg">
        {student.fullName}
      </h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <StudentDetailForm student={student} governorateOptions={governorateOptions} />
        <div className="flex flex-col gap-6">
          <RoleChangeSection student={student} />
          <CourseAccessSection userId={userId} grants={grants} closedCourses={closedCourses} />
        </div>
      </div>
    </>
  );
}
