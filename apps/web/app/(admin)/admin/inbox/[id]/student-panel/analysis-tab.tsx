import { StudentAnalyticsDetailSchema, type StudentAnalyticsDetail } from '@ayman/contracts/admin/analytics';
import { copy } from '@ayman/contracts/copy/admin';
import { adminStudentPanel as c } from '@ayman/contracts/copy/admin-student-panel';
import { adminGetOrForbidden } from '@/lib/admin-api';
import { StudentRecord } from '@/components/admin/students/student-record';
import { PanelNotice } from './panel-notice';

/**
 * «التحليل» — the student page's record, whole: the same component over the
 * same read, so the drawer and the page can never tell him two different
 * stories about one student.
 *
 * The read 404s for an account that is not a student (the analytics roster
 * joins on `role = 'student'`), and that is a notice here, never a throw —
 * see `StudentPanel` on why nothing in the drawer may throw.
 */
export async function AnalysisTab({ userId }: { userId: string }) {
  let detail: StudentAnalyticsDetail | null;
  try {
    detail = await adminGetOrForbidden(
      `/api/admin/analytics/students/${encodeURIComponent(userId)}`,
      StudentAnalyticsDetailSchema,
    );
  } catch {
    return <PanelNotice title={copy.analytics.recordUnavailable} hint={copy.analytics.recordUnavailableHint} />;
  }
  if (detail === null) {
    return <PanelNotice title={copy.admin.settings.panelForbidden} hint={copy.admin.settings.panelForbiddenHint} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[length:var(--fs-text-sm)] leading-relaxed text-fg-muted">{c.analysis.lead}</p>
      <StudentRecord detail={detail} />
    </div>
  );
}
