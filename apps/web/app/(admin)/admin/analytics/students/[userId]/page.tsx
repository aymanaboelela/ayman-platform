import Link from 'next/link';
import { StudentAnalyticsDetailSchema } from '@ayman/contracts/admin/analytics';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts';
import { adminGetOrNotFound } from '@/lib/admin-api';
import { num } from '@/components/admin/charts/format';
import { StudentRecord } from '@/components/admin/students/student-record';
import { AnalyticsNav } from '../../analytics-nav';

const c = copy.analytics;

export const metadata = { title: c.studentProfile };

/**
 * One student, every number the platform holds about them.
 *
 * The body of this page is `<StudentRecord>`, which also renders inside
 * `/admin/students/[userId]`. It used to live here as inline markup, and the
 * result was that the screen an operator actually opens — the one with the
 * profile form and the ban button — showed nothing about what the student had
 * done, while this screen, reachable only from the cohort table, held all of
 * it. One component, mounted twice, is what stops the two answers from
 * drifting apart again.
 *
 * The route stays because things link INTO it: the analytics roster table and
 * the per-lesson breakdown both point here.
 */
export default async function StudentAnalyticsDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const detail = await adminGetOrNotFound(
    `/api/admin/analytics/students/${userId}`,
    StudentAnalyticsDetailSchema,
  );

  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <Link
        href="/admin/analytics/students"
        className="mb-4 inline-block text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
      >
        {'< '}
        {c.navStudents}
      </Link>

      <header className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">
          {detail.summary.fullName}
        </h1>
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
          {detail.summary.year === null
            ? ''
            : formatCopy(c.yearLabel, { n: num(detail.summary.year) })}
          {detail.summary.governorateNameAr ? ` · ${detail.summary.governorateNameAr}` : ''}
        </p>
        <Link
          href={`/admin/students/${userId}`}
          className="text-[length:var(--fs-text-sm)] text-accent-text hover:underline"
        >
          {copy.admin.students.detailTitle}
        </Link>
      </header>

      <AnalyticsNav />

      <div className="mt-6">
        <StudentRecord detail={detail} />
      </div>
    </div>
  );
}
