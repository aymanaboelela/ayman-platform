import { Suspense } from 'react';
import Link from 'next/link';
import { AdminGrantRowSchema, AdminStudentDetailSchema } from '@ayman/contracts/admin/students';
import { AdminSubscriptionRowSchema } from '@ayman/contracts/admin/payments';
import { z } from 'zod';
import { TaxonomySchema } from '@ayman/contracts';
import { StudentAnalyticsDetailSchema } from '@ayman/contracts/admin/analytics';
import { copy } from '@ayman/contracts/copy/admin';
import { Skeleton } from '@ayman/ui/components/skeleton';
import { apiGet } from '@/lib/api';
import { adminGet } from '@/lib/admin-api';
import { StudentRecord } from '@/components/admin/students/student-record';
import { WhatsappButton } from '@/components/admin/whatsapp-button';
import { StudentDetailForm } from './student-detail-form';
import { RoleChangeSection } from './role-change-section';
import { SetPasswordSection } from './set-password-section';
import { CourseAccessSection } from './course-access-section';
import { SubscriptionSection } from './subscription-section';
import { AccountAccessSection } from './account-access-section';

export const metadata = { title: copy.admin.students.detailTitle };

/**
 * The record, streamed in behind its own Suspense boundary.
 *
 * Two independent reasons it is not part of the page's main `Promise.all`.
 *
 * **It is the slow read.** It fans out to eight queries, one of which is the
 * cohort comparison — aggregates over every row in `lesson_progress` and
 * `quiz_attempts`. The controls above are why an operator opened this page,
 * and blocking a phone-number edit on a class-wide median would be paying for
 * analytics on every administrative task.
 *
 * **It is the only read allowed to fail.** The analytics route resolves a
 * student through a roster CTE that joins `users` on `role = 'student'`, so it
 * 404s for any account that is not one — and this page legitimately opens
 * those: an admin, or a content author, both of which appear in the list it is
 * reached from. `adminGet` throws on every non-2xx, so awaiting it beside the
 * others would turn "this account has no student record" into a 500 on a
 * screen whose actual job works perfectly well without it.
 *
 * Swallowing the reason is deliberate here and nowhere else: there is exactly
 * one thing to do with any failure, which is render the panel that says so.
 */
async function StudentRecordSection({ userId }: { userId: string }) {
  let record;
  try {
    record = await adminGet(
      `/api/admin/analytics/students/${userId}`,
      StudentAnalyticsDetailSchema,
    );
  } catch {
    return (
      <div className="rounded-lg border border-dashed border-line p-8 text-center">
        <p className="text-fg-muted">{copy.analytics.recordUnavailable}</p>
        <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
          {copy.analytics.recordUnavailableHint}
        </p>
      </div>
    );
  }

  return <StudentRecord detail={record} />;
}

/** The shape of the record's first screen — eight tiles over a wide card — so
 *  the page does not jump when the real thing arrives. */
function StudentRecordSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      {[0, 1].map((row) => (
        <div key={row} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((tile) => (
            <div key={tile} className="rounded-lg border border-line bg-surface-2 p-4">
              <Skeleton width="narrow" className="h-3" />
              <Skeleton width="wide" className="mt-2 h-7" />
            </div>
          ))}
        </div>
      ))}
      <div className="rounded-lg border border-line bg-surface-2 p-5">
        <Skeleton width="narrow" className="h-4" />
        <Skeleton width="full" className="mt-3 h-24" />
      </div>
    </div>
  );
}

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
   * Five independent reads, issued together.
   *
   * `grants` and the course list are for `<CourseAccessSection>`: which closed
   * courses exist, and which of them this student already has. The course list
   * is filtered to CLOSED ones here rather than in the component — a grant on
   * an open course is a no-op, so offering one would be a control that does
   * nothing.
   *
   * `subscriptions` and the PRICED subset of the same course list are for
   * `<SubscriptionSection>` — a different panel entirely, see its own header
   * comment. Every priced course IS `requiresGrant` (the DB's own
   * `courses_priced_requires_grant` constraint), so the two course lists
   * overlap; they serve different controls for different reasons and neither
   * is a subset built from the other.
   */
  const [student, taxonomy, grants, courses, subscriptions] = await Promise.all([
    adminGet(`/api/admin/students/${userId}`, AdminStudentDetailSchema),
    apiGet('/api/taxonomy', TaxonomySchema),
    adminGet(`/api/admin/students/${userId}/grants`, z.array(AdminGrantRowSchema)),
    adminGet(
      '/api/admin/courses',
      z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          status: z.string(),
          requiresGrant: z.boolean(),
          monthlyPriceCents: z.number().int().nullable(),
          quarterlyPriceCents: z.number().int().nullable(),
          // الترم الأول / الترم الثاني — `SubscriptionSection`'s own term
          // option finds its choices here.
          terms: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              isOpen: z.boolean(),
              priceCents: z.number().int().nullable(),
            }),
          ),
        }),
      ),
    ),
    adminGet(`/api/admin/students/${userId}/subscriptions`, z.array(AdminSubscriptionRowSchema)),
  ]);

  const closedCourses = courses
    .filter((course) => course.requiresGrant)
    .map((course) => ({ id: course.id, title: course.title }));

  const subscribableCourses = courses
    .filter(
      (course) =>
        course.status === 'published' &&
        (course.monthlyPriceCents !== null ||
          course.quarterlyPriceCents !== null ||
          course.terms.some((term) => term.priceCents !== null)),
    )
    .map((course) => ({
      id: course.id,
      title: course.title,
      monthlyPriceCents: course.monthlyPriceCents,
      quarterlyPriceCents: course.quarterlyPriceCents,
      // Every priced term is offered here, open or closed — the admin
      // manual-subscribe path is a deliberate override, unlike the
      // student-facing flow. See `SubscriptionSection`'s own doc.
      terms: course.terms.filter((term) => term.priceCents !== null),
    }));

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

      {/*
        The name, the number and the way to use it — one row, at the top.

        The phone was on this page only as an editable field buried in the
        profile form; reaching a student meant reading it off the screen and
        retyping it into another app. «زرار الاتصال يوديني يكلمه واتساب».
      */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">
          {student.fullName}
        </h1>
        <span className="mono text-[length:var(--fs-text-sm)] text-fg-muted">{student.phone}</span>
        <WhatsappButton phone={student.phone} label={copy.admin.students.whatsapp} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <StudentDetailForm student={student} governorateOptions={governorateOptions} />
        <div className="flex flex-col gap-6">
          <RoleChangeSection student={student} />
          <SetPasswordSection student={student} />
          <CourseAccessSection userId={userId} grants={grants} closedCourses={closedCourses} />
          <SubscriptionSection
            userId={userId}
            subscriptions={subscriptions}
            courses={subscribableCourses}
          />
          {/* LAST in the column, deliberately. Two of its three controls are
              destructive and one is irreversible, so it sits below the
              everyday ones rather than beside them — an operator scrolling to
              change a role should not pass «مسح الحساب» on the way. */}
          <AccountAccessSection student={student} />
        </div>
      </div>

      {/* Full width, and BELOW the controls. The record is the longer read but
          the controls are why an operator opened the page — putting a
          ninety-day chart above the ban button would push every action off
          the first screen. */}
      <section className="mt-8">
        <h2 className="text-[length:var(--fs-title-3)] font-semibold text-fg">
          {copy.analytics.recordTitle}
        </h2>
        <p className="mt-1 mb-5 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] leading-relaxed text-fg-muted">
          {copy.analytics.recordLead}
        </p>

        <Suspense fallback={<StudentRecordSkeleton />}>
          <StudentRecordSection userId={userId} />
        </Suspense>
      </section>
    </>
  );
}
