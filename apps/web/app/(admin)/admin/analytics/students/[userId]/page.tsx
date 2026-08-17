import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StudentAnalyticsDetailSchema } from '@ayman/contracts/admin/analytics';
import { AdminStudentDetailSchema } from '@ayman/contracts/admin/students';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts';
import { adminGetOrNull } from '@/lib/admin-api';
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
  const detail = await adminGetOrNull(
    `/api/admin/analytics/students/${userId}`,
    StudentAnalyticsDetailSchema,
  );

  /*
   * ⚠️ «مش موجود» IS THE WRONG ANSWER FOR AN ACCOUNT THAT EXISTS.
   *
   * This endpoint resolves a student through a roster CTE joining `users` on
   * `role = 'student'`, so it 404s for an account that is real and simply is
   * not one — an admin, a content author, a student who has not finished
   * onboarding. Before, that threw and the screen read «حصل خطأ»; then it
   * became the 404 page, which is honest about the URL and useless about the
   * question: the operator is looking AT a person and is told the page does not
   * exist, with nowhere to go next.
   *
   * So the miss is answered, not just survived. If the account is real, this
   * says which account it is, why there is no record, and links to the page
   * that DOES serve it. Only a userId that matches nothing at all is a genuine
   * 404 — and `notFound()` is still what happens then.
   *
   * The second read costs nothing on the normal path: it only runs when the
   * first one missed.
   */
  if (!detail) {
    const account = await adminGetOrNull(
      `/api/admin/students/${userId}`,
      AdminStudentDetailSchema,
    );
    if (!account) notFound();

    return (
      <div className="mx-auto w-full max-w-[80rem]">
        <Link
          href="/admin/analytics/students"
          className="mb-4 inline-block text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
        >
          {'< '}
          {c.navStudents}
        </Link>

        <header className="mb-4">
          <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">
            {account.fullName}
          </h1>
        </header>

        <AnalyticsNav />

        <div className="mt-6 rounded-lg border border-dashed border-line p-8 text-center">
          <p className="text-[length:var(--fs-title-4)] font-medium text-fg">
            {c.recordUnavailable}
          </p>
          <p className="mx-auto mt-2 max-w-[var(--w-prose)] text-fg-muted">
            {c.recordUnavailableHint}
          </p>
          <Link
            href={`/admin/students/${userId}`}
            className="mt-5 inline-flex h-10 items-center rounded-sm bg-accent px-4 text-[length:var(--fs-text-sm)] font-medium text-[#1A1206] transition-colors duration-[160ms] ease-out hover:bg-accent-hover"
          >
            {c.recordOpenAccount}
          </Link>
        </div>
      </div>
    );
  }

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
