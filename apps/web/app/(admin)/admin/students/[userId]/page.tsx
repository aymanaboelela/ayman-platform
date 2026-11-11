import { Suspense } from 'react';
import Link from 'next/link';
import {
  AdminGrantRowSchema,
  AdminStudentConversationSchema,
  AdminStudentDetailSchema,
  StudentHistoryEntrySchema,
} from '@ayman/contracts/admin/students';
import { AdminSubscriptionRowSchema } from '@ayman/contracts/admin/payments';
import { z } from 'zod';
import { StudentAnalyticsDetailSchema } from '@ayman/contracts/admin/analytics';
import { copy } from '@ayman/contracts/copy/admin';
import { WaStudentChatSchema } from '@ayman/contracts/wa-bot/schemas';
import { Skeleton } from '@ayman/ui/components/skeleton';
import { getTaxonomyOrNull } from '@/lib/taxonomy';
import { adminGet, adminGetOrForbidden, adminGetOrNull } from '@/lib/admin-api';
import { can, getSession } from '@/lib/session';
import { SessionDeviceListSchema } from '@ayman/contracts/sessions';
import { StudentRecord } from '@/components/admin/students/student-record';
import { WhatsappButton } from '@/components/admin/whatsapp-button';
import { StudentDetailForm } from './student-detail-form';
import { RoleChangeSection } from './role-change-section';
import { SetPasswordSection } from './set-password-section';
import { CourseAccessSection } from './course-access-section';
import { SubscriptionSection } from './subscription-section';
import { AccountAccessSection } from './account-access-section';
import { HistorySection } from './history-section';
import { ConversationSection } from './conversation-section';
import { DevicesSection } from './devices-section';
import { CenterAttendanceSection } from './center-attendance-section';
import { GamesSection } from './games-section';
import { PaymentsSection, PaymentsSectionSkeleton } from './payments-section';
import { loadStudentCourseOptions } from './course-options';
import { WalletSection } from './wallet-section';
import { RankChip } from './rank-chip';

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
/**
 * The panel a section becomes when the operator's role does not reach it.
 *
 * Dashed like the analytics fallback beside it, because it is the same kind of
 * thing: a place where content would be, that this reader cannot have. It says
 * WHY and where the permission comes from — «nothing here» with no reason is
 * indistinguishable from a bug, which is what sent this page to the person who
 * reported it.
 */
function ForbiddenPanel() {
  return (
    <div className="rounded-lg border border-dashed border-line p-6 text-center">
      <p className="text-fg-muted">{copy.admin.settings.panelForbidden}</p>
      <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
        {copy.admin.settings.panelForbiddenHint}
      </p>
    </div>
  );
}

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

/**
 * «المحادثة» — this number's thread in «صندوق الوارد ← واتساب», beside the
 * button that opens WhatsApp itself. Absent, not disabled, when the number
 * never wrote to the linked device, when the stack has no bot
 * (`whatsapp.bot` → 404) or when the operator's role cannot read the inbox:
 * none of those is something to act on from here.
 */
async function StudentChatLink({ userId }: { userId: string }) {
  let chat;
  try {
    chat = await adminGetOrNull(`/api/admin/wa-bot/students/${encodeURIComponent(userId)}/chat`, WaStudentChatSchema);
  } catch {
    return null;
  }
  if (!chat?.id) return null;
  return (
    <Link
      href={`/admin/inbox/whatsapp/${chat.id}`}
      className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-[length:var(--fs-text-sm)] font-medium text-fg transition-colors duration-[160ms] ease-out hover:bg-surface-2"
    >
      {copy.admin.students.whatsappChat}
    </Link>
  );
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
   * `grants` and the closed-course list are for `<CourseAccessSection>`;
   * `subscriptions` and the priced-course list are for
   * `<SubscriptionSection>`. Both course lists come from
   * `loadStudentCourseOptions`, which the chat's student drawer shares — the
   * filters that make each control meaningful are documented there.
   */
  const [student, taxonomy, grants, courseOptions, subscriptions, history, conversation, devices] =
    await Promise.all([
    adminGet(`/api/admin/students/${userId}`, AdminStudentDetailSchema),
    getTaxonomyOrNull(),
    adminGet(`/api/admin/students/${userId}/grants`, z.array(AdminGrantRowSchema)),
    loadStudentCourseOptions(),
    /*
     * ⚠️ `OrForbidden`, and this one is not optional.
     *
     * `ROLE_PERMISSIONS` gives `owner` a curated set on purpose: money is
     * grantable, not default. So on EVERY instructor stack this route answers
     * 403 for the person whose platform it is — and inside a bare
     * `Promise.all` one rejected read takes the whole page with it. Measured
     * on both: `/admin/students/{id}` was 200 and the screen was «حصلت مشكلة».
     */
    adminGetOrForbidden(
      `/api/admin/students/${userId}/subscriptions`,
      z.array(AdminSubscriptionRowSchema),
    ),
    adminGet(`/api/admin/students/${userId}/history`, z.array(StudentHistoryEntrySchema)),
    /*
     * The thread with this student, beside the five reads above rather than in
     * its own boundary: it is one indexed lookup plus at most thirty rows, and
     * a Suspense fallback for a panel that resolves as fast as the profile
     * form does would only make the column shuffle after paint.
     *
     * Unlike `StudentRecordSection` it does not fail SILENTLY — a 403 here
     * means this operator does not hold `conversation:read`, which is a real
     * answer the page should surface rather than a panel that pretends the
     * student has never written.
     *
     * ⚠️ «Surface it» means «say so in this panel», NOT «throw». It threw,
     * inside this `Promise.all`, so the one permission an instructor is not
     * given by default took down their entire student screen. `owner` never
     * holds `conversation:read` — see `ROLE_PERMISSIONS` — so this was not an
     * edge case on those stacks, it was every student, every time.
     */
    adminGetOrForbidden(
      `/api/admin/students/${userId}/conversation`,
      AdminStudentConversationSchema,
    ),

    /*
     * الأجهزة اللي الحساب مفتوح عليها. `OrForbidden` زي اللي فوقه: الراوت
     * على `student:read` فأي حد فاتح الصفحة دي عنده الصلاحية — بس القاعدة
     * اللي الصفحة بقت ماشية عليها إن لوحة مرفوضة تتقال، مش تموّت الصفحة.
     */
    adminGetOrForbidden(`/api/admin/students/${userId}/sessions`, SessionDeviceListSchema),
  ]);

  /*
   * Which door the role card opens, if any. `getSession` is `cache()`d — the
   * layout already read it, so this is not a second request.
   */
  const session = await getSession();
  const roleDoor = can(session, 'student:role-change')
    ? 'admin'
    : can(session, 'staff:manage')
      ? 'staff'
      : null;

  const { closedCourses, subscribableCourses } = courseOptions;

  /* ⚠️ `getTaxonomyOrNull()`, not `apiGet('/api/taxonomy', …)` — the throwing
     uncached read is what 500'd `/admin/students` for seven minutes after a
     deploy on 2026-09-04. Its page.tsx carries the full account; the short
     version is that `apiGet` forwards no cookie, so every server-side taxonomy
     read in the fleet shares one rate-limit identity, and a cold cache after a
     container restart empties that bucket. Here the data only labels a select,
     so `null` costs an empty dropdown rather than the screen. */
  const governorateOptions = (taxonomy?.governorates ?? [])
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
        <Suspense fallback={null}>
          <StudentChatLink userId={userId} />
        </Suspense>
        {/* «الترتيب في الدفعة» — نفس رقم «ترتيبي» عند الطالب. في boundary
            لوحده ومن غير fallback: قراية زيادة، والفورم تحت مايستناهاش. */}
        <Suspense fallback={null}>
          <RankChip userId={userId} fullName={student.fullName} />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <StudentDetailForm student={student} governorateOptions={governorateOptions} />
          {/* «الاشتراكات والفلوس» — every payment, new or renewal. In the wide
              column, under the profile: it is a read, and it is the longest
              one on the page after the record below. Its own boundary so the
              form above never waits on it. */}
          <Suspense fallback={<PaymentsSectionSkeleton />}>
            <PaymentsSection userId={userId} />
          </Suspense>
          {/* «المحفظة» — right under the payments: a wallet purchase shows in
              both, and the money for it only here. Its own boundary. */}
          <Suspense fallback={null}>
            <WalletSection userId={userId} />
          </Suspense>
          {/* Its own boundary: two more reads the profile form must not wait
              on, and a section that renders nothing on a stack with no
              centre — so its fallback is nothing too, not a skeleton that
              would flash and vanish. */}
          <Suspense fallback={null}>
            <CenterAttendanceSection userId={userId} />
          </Suspense>
          {/* «الألعاب» — كام جولة، وقت اللعب، وأعلى نتيجة. نفس المعاملة:
              بوندري لوحده، ولو القراية وقعت أو الفيتشر مقفولة مابيظهرش. */}
          <Suspense fallback={null}>
            <GamesSection userId={userId} />
          </Suspense>
        </div>
        <div className="flex flex-col gap-6">
          {roleDoor ? <RoleChangeSection student={student} mode={roleDoor} /> : null}
          <SetPasswordSection student={student} />
          <CourseAccessSection userId={userId} grants={grants} closedCourses={closedCourses} />
          {/* `null` is «not yours to see», never «empty» — see
              `adminGetOrForbidden`. Rendering the section's own empty state
              here would tell an instructor their student has no subscription,
              which is a different and false statement. */}
          {subscriptions === null ? (
            <ForbiddenPanel />
          ) : (
            <SubscriptionSection
              userId={userId}
              subscriptions={subscriptions}
              courses={subscribableCourses}
            />
          )}
          {/* Above `AccountAccessSection`, with the everyday controls: talking
              to a student is the most ordinary thing on this page, and the
              panel below it is where the destructive ones start. */}
          {conversation === null ? (
            <ForbiddenPanel />
          ) : (
            <ConversationSection userId={userId} conversation={conversation} />
          )}
          {/* `canManage` hides the three writes from an operator who holds
              `student:read` alone — they would only come back 403. */}
          {devices === null ? (
            <ForbiddenPanel />
          ) : (
            <DevicesSection
              userId={userId}
              devices={devices}
              maxDevices={student.maxDevices}
              canManage={can(session, 'student:write')}
            />
          )}
          {/* LAST in the column, deliberately. Two of its three controls are
              destructive and one is irreversible, so it sits below the
              everyday ones rather than beside them — an operator scrolling to
              change a role should not pass «مسح الحساب» on the way. */}
          <AccountAccessSection student={student} />
          <HistorySection entries={history} />
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
