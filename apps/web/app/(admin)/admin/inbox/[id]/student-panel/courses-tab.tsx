import { z } from 'zod';
import { AdminGrantRowSchema } from '@ayman/contracts/admin/students';
import { AdminSubscriptionRowSchema } from '@ayman/contracts/admin/payments';
import { copy } from '@ayman/contracts/copy/admin';
import { adminStudentPanel as c } from '@ayman/contracts/copy/admin-student-panel';
import { adminGetOrForbidden } from '@/lib/admin-api';
import { CourseAccessSection } from '../../../students/[userId]/course-access-section';
import { loadStudentCourseOptions } from '../../../students/[userId]/course-options';
import { SubscriptionSection } from '../../../students/[userId]/subscription-section';
import { PanelNotice } from './panel-notice';

/**
 * «الكورسات» — open a month, a term or a whole course, or close one.
 *
 * The student page's own two panels, not a second copy of them: the same
 * components, fed by the same reads (`loadStudentCourseOptions` is shared for
 * exactly this), calling the same server actions. Those actions end in
 * `refresh()` (`lib/revalidate-screen.ts`), which re-renders the page he is
 * ON — this thread, `?panel=courses` included — so a new grant shows here at
 * once without the drawer closing.
 *
 * Both reads are `OrForbidden`: money is grantable, not default, so an
 * instructor's own role often cannot list subscriptions, and a 403 there must
 * read as «مش ليك» in that panel rather than take the drawer down.
 */
export async function CoursesTab({ userId }: { userId: string }) {
  let grants, options, subscriptions;
  try {
    [grants, options, subscriptions] = await Promise.all([
      adminGetOrForbidden(`/api/admin/students/${encodeURIComponent(userId)}/grants`, z.array(AdminGrantRowSchema)),
      loadStudentCourseOptions(),
      adminGetOrForbidden(
        `/api/admin/students/${encodeURIComponent(userId)}/subscriptions`,
        z.array(AdminSubscriptionRowSchema),
      ),
    ]);
  } catch {
    return <PanelNotice title={c.unavailable} />;
  }

  const forbidden = (
    <PanelNotice title={copy.admin.settings.panelForbidden} hint={copy.admin.settings.panelForbiddenHint} />
  );

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[length:var(--fs-text-sm)] leading-relaxed text-fg-muted">{c.courses.lead}</p>
      {subscriptions === null ? (
        forbidden
      ) : (
        <SubscriptionSection userId={userId} subscriptions={subscriptions} courses={options.subscribableCourses} />
      )}
      {grants === null ? (
        forbidden
      ) : (
        <CourseAccessSection userId={userId} grants={grants} closedCourses={options.closedCourses} />
      )}
    </div>
  );
}
