import Link from 'next/link';
import { AdminStudentDetailSchema } from '@ayman/contracts/admin/students';
import { TaxonomySchema, copy } from '@ayman/contracts';
import { apiGet } from '@/lib/api';
import { adminGet } from '@/lib/admin-api';
import { StudentDetailForm } from './student-detail-form';
import { RoleChangeSection } from './role-change-section';

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

  const [student, taxonomy] = await Promise.all([
    adminGet(`/api/admin/students/${userId}`, AdminStudentDetailSchema),
    apiGet('/api/taxonomy', TaxonomySchema),
  ]);

  const governorateOptions = taxonomy.governorates
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((g) => ({ value: g.code, label: g.nameAr }));

  return (
    <>
      <Link
        href="/admin/students"
        className="mb-16 inline-block text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
      >
        {'< '}
        {copy.admin.students.backToList}
      </Link>

      <h1 className="mb-16 text-[length:var(--fs-title-2)] font-semibold text-fg">
        {student.fullName}
      </h1>

      <div className="grid grid-cols-1 gap-24 lg:grid-cols-[2fr_1fr]">
        <StudentDetailForm student={student} governorateOptions={governorateOptions} />
        <RoleChangeSection student={student} />
      </div>
    </>
  );
}
