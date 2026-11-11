import { Suspense } from 'react';
import Link from 'next/link';
import { ExternalLink, Phone } from 'lucide-react';
import { AdminStudentDetailSchema, type AdminStudentDetail } from '@ayman/contracts/admin/students';
import { copy } from '@ayman/contracts/copy/admin';
import { adminStudentPanel as c } from '@ayman/contracts/copy/admin-student-panel';
import { formatCopy } from '@ayman/contracts/format';
import { gradeOf } from '@ayman/contracts/grades';
import { Skeleton } from '@ayman/ui/components/skeleton';
import { cn } from '@ayman/ui/lib/cn';
import { adminGetOrForbidden } from '@/lib/admin-api';
import { TENANT_GRADES } from '@/lib/tenant-grades';
import { yearLabelAr } from '@/lib/year-label';
import { WhatsappButton } from '@/components/admin/whatsapp-button';
import { RankChip } from '../../../students/[userId]/rank-chip';
import { WASH } from '../../../attempts/labels';
import { AnalysisTab } from './analysis-tab';
import { CoursesTab } from './courses-tab';
import { ExamsTab } from './exams-tab';
import { OverviewTab } from './overview-tab';
import { PanelTabs } from './panel-sheet';
import type { PanelTab } from './panel-tabs';
import { PanelNotice } from './panel-notice';

/** «الصف الثاني الثانوي» — the stack's own grade name when it names grades
 *  (`TENANT_GRADES`), the historical spelling everywhere else. */
function yearOf(student: AdminStudentDetail): string | null {
  if (student.year === null) return null;
  return gradeOf(TENANT_GRADES, student.systemSlug ?? undefined, student.year)?.labelAr ?? yearLabelAr(student.year);
}

/**
 * Everything about the student in this conversation — «في ٣ نقط كده أضغط
 * عليها يبقى في كل حاجة عن الطالب».
 *
 * The hero (who, which year, how to reach them) is read here, always; the tab
 * body below it streams behind its own `Suspense`, keyed on the tab so a
 * switch shows the new tab's skeleton rather than the old tab's content
 * pretending to be current.
 *
 * Nothing in here may throw. The drawer is rendered INSIDE the thread page,
 * and an uncaught read would take the conversation down with it — every read
 * is `OrForbidden` or caught, and each failure becomes a notice in its tab.
 */
export async function StudentPanel({
  userId,
  tab,
  threadPath,
}: {
  userId: string;
  tab: PanelTab;
  threadPath: string;
}) {
  let student: AdminStudentDetail | null;
  try {
    student = await adminGetOrForbidden(
      `/api/admin/students/${encodeURIComponent(userId)}`,
      AdminStudentDetailSchema,
    );
  } catch {
    return (
      <div className="p-6 pt-16">
        <PanelNotice title={c.unavailable} />
      </div>
    );
  }
  if (student === null) {
    return (
      <div className="p-6 pt-16">
        <PanelNotice title={copy.admin.settings.panelForbidden} hint={copy.admin.settings.panelForbiddenHint} />
      </div>
    );
  }

  return (
    <>
      <PanelHero student={student} />
      <PanelTabs active={tab} />
      <div className="shrink-0 p-4 md:p-6">
        <Suspense key={tab} fallback={<TabSkeleton />}>
          {tab === 'overview' ? (
            <OverviewTab student={student} threadPath={threadPath} />
          ) : tab === 'courses' ? (
            <CoursesTab userId={userId} />
          ) : tab === 'exams' ? (
            <ExamsTab userId={userId} />
          ) : (
            <AnalysisTab userId={userId} />
          )}
        </Suspense>
      </div>
    </>
  );
}

/**
 * The band across the top: a portrait-sized initial, the name, the number,
 * and the chips that answer «مين ده؟» before any tab is read — the year, the
 * stream, online or centre, and a ban if there is one.
 *
 * `pe-14` keeps the name clear of the drawer's ✕, which sits in this corner.
 */
function PanelHero({ student }: { student: AdminStudentDetail }) {
  const year = yearOf(student);
  const chip = 'rounded-full px-2.5 py-0.5 text-[length:var(--fs-text-xs)] font-medium';
  const initial = student.fullName.trim().charAt(0) || '؟';

  return (
    <header
      className={cn(
        'relative shrink-0 border-b border-line px-4 pt-5 pb-4 pe-14 md:px-6',
        'bg-[linear-gradient(135deg,color-mix(in_oklch,var(--color-accent),transparent_82%),color-mix(in_oklch,var(--info),transparent_88%)_60%,transparent)]',
      )}
    >
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="grid size-16 shrink-0 place-items-center rounded-2xl bg-accent text-[length:var(--fs-title-2)] font-bold text-[color:var(--on-accent-ink)] shadow-sm"
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[length:var(--fs-title-3)] font-bold text-fg">{student.fullName}</h2>
          <p className="mono mt-0.5 flex items-center gap-1.5 text-[length:var(--fs-text-sm)] text-fg-muted">
            <Phone className="size-3.5 shrink-0" aria-hidden="true" />
            <span dir="ltr" className="[unicode-bidi:isolate]">
              {student.phone}
            </span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={cn(chip, WASH.info)}>{year ?? c.hero.noYear}</span>
            {student.schoolStream ? (
              <span className={cn(chip, WASH.study)}>{copy.stream[student.schoolStream]}</span>
            ) : null}
            {student.attendanceMode ? (
              <span className={cn(chip, student.attendanceMode === 'center' ? WASH.warn : WASH.ok)}>
                {copy.admin.centers.student.attendanceModes[student.attendanceMode]}
              </span>
            ) : null}
            <span className={cn(chip, WASH.neutral, 'mono')}>
              {formatCopy(c.hero.studentNumber, { n: student.studentNumber })}
            </span>
            {student.bannedAt ? <span className={cn(chip, WASH.err)}>{c.hero.banned}</span> : null}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <WhatsappButton phone={student.phone} label={c.whatsapp} size="sm" />
        <Link
          href={`/admin/students/${student.id}`}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 text-[length:var(--fs-text-sm)] font-medium text-fg transition-colors duration-[160ms] ease-out hover:border-accent/50"
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
          {c.fullProfile}
        </Link>
        {/* The cohort rank, in its own boundary with no fallback: a nicety
            that must never hold the hero up. */}
        <Suspense fallback={null}>
          <RankChip userId={student.id} fullName={student.fullName} />
        </Suspense>
      </div>
    </header>
  );
}

function TabSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((tile) => (
          <div key={tile} className="rounded-2xl border border-line bg-surface-2 p-4">
            <Skeleton className="size-9 rounded-xl" />
            <Skeleton width="wide" className="mt-3 h-6" />
            <Skeleton width="narrow" className="mt-2 h-3" />
          </div>
        ))}
      </div>
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  );
}
