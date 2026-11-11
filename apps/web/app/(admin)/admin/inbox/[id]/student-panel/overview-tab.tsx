import { Suspense } from 'react';
import Link from 'next/link';
import {
  Activity,
  BarChart3,
  BookOpen,
  BookOpenCheck,
  Building2,
  ChevronLeft,
  ClipboardCheck,
  Clock,
  GraduationCap,
  Mail,
  MapPin,
  Phone,
  School,
  Target,
  Trophy,
} from 'lucide-react';
import type { AdminStudentDetail } from '@ayman/contracts/admin/students';
import { StudentAnalyticsDetailSchema, type StudentAnalyticsDetail } from '@ayman/contracts/admin/analytics';
import { copy } from '@ayman/contracts/copy/admin';
import { adminStudentPanel as c } from '@ayman/contracts/copy/admin-student-panel';
import { formatCopy } from '@ayman/contracts/format';
import { Skeleton } from '@ayman/ui/components/skeleton';
import { cn } from '@ayman/ui/lib/cn';
import { adminGetOrForbidden } from '@/lib/admin-api';
import { formatCairoShort } from '@/components/admin/exams/exam-time';
import { WASH } from '../../../attempts/labels';
import { PanelNotice } from './panel-notice';

const NUM = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

/**
 * A 0–1 ratio as «68%», or «—» when there is nothing to divide.
 *
 * Wrapped in LTR isolates (U+2066…U+2069): inside an Arabic sentence such as
 * «الدفعة {n}» the bidi algorithm otherwise moves the «%» to the other side
 * of the digits and it reads «%30».
 */
function pct(value: number | null): string {
  return value === null ? '—' : `\u2066${Math.round(value * 100)}%\u2069`;
}

/**
 * «الملف» — the first tab: the numbers that say how this student is doing,
 * the profile fields worth knowing mid-conversation, and a way into each of
 * the other tabs with what it is for written on it.
 */
export function OverviewTab({ student, threadPath }: { student: AdminStudentDetail; threadPath: string }) {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="mb-3 text-[length:var(--fs-text-sm)] font-semibold text-fg-muted">{c.overview.statsTitle}</h3>
        {/* Its own boundary: the analytics read is the slow one (cohort
            aggregates), and the profile fields below are already in hand. */}
        <Suspense fallback={<StatsSkeleton />}>
          <Stats userId={student.id} />
        </Suspense>
      </section>

      <section>
        <h3 className="mb-3 text-[length:var(--fs-text-sm)] font-semibold text-fg-muted">
          {c.overview.shortcutsTitle}
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Shortcut
            href={`${threadPath}?panel=courses`}
            icon={BookOpenCheck}
            tone="accent"
            title={c.tabs.courses}
            body={c.overview.shortcutCourses}
          />
          <Shortcut
            href={`${threadPath}?panel=exams`}
            icon={ClipboardCheck}
            tone="info"
            title={c.tabs.exams}
            body={c.overview.shortcutExams}
          />
          <Shortcut
            href={`${threadPath}?panel=analysis`}
            icon={BarChart3}
            tone="study"
            title={c.tabs.analysis}
            body={c.overview.shortcutAnalysis}
          />
        </div>
      </section>

      <Info student={student} />
    </div>
  );
}

async function Stats({ userId }: { userId: string }) {
  let detail: StudentAnalyticsDetail | null;
  try {
    detail = await adminGetOrForbidden(
      `/api/admin/analytics/students/${encodeURIComponent(userId)}`,
      StudentAnalyticsDetailSchema,
    );
  } catch {
    // The analytics roster joins on `role = 'student'` and 404s for anyone
    // else — the same «no record» the student page shows.
    return <PanelNotice title={c.overview.statsUnavailable} />;
  }
  if (detail === null) {
    return <PanelNotice title={copy.admin.settings.panelForbidden} hint={copy.admin.settings.panelForbiddenHint} />;
  }

  const s = detail.summary;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Tile
        icon={BookOpen}
        tone="ok"
        label={c.overview.lessonsCompleted}
        value={NUM.format(s.lessonsCompleted)}
        hint={formatCopy(c.overview.lessonsOf, { n: NUM.format(s.lessonsOpened) })}
      />
      <Tile icon={Clock} tone="info" label={c.overview.watchHours} value={NUM.format(s.watchHours)} />
      <Tile icon={ClipboardCheck} tone="study" label={c.exams.sat} value={NUM.format(s.quizzesTaken)} />
      <Tile
        icon={Target}
        tone="accent"
        label={c.overview.meanScore}
        value={pct(s.meanScore)}
        hint={formatCopy(c.overview.cohort, { n: pct(detail.cohort.meanScore) })}
      />
      <Tile
        icon={Trophy}
        tone="warn"
        label={c.overview.passRate}
        value={pct(s.passRate)}
        hint={formatCopy(c.overview.cohort, { n: pct(detail.cohort.passRate) })}
      />
      <Tile
        icon={Activity}
        tone="neutral"
        label={c.overview.lastActive}
        value={s.lastActiveAt ? formatCairoShort(s.lastActiveAt) : c.overview.neverActive}
        small
      />
    </div>
  );
}

function Tile({
  icon: Icon,
  tone,
  label,
  value,
  hint,
  small = false,
}: {
  icon: typeof Clock;
  tone: keyof typeof WASH;
  label: string;
  value: string;
  hint?: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-4">
      <span aria-hidden="true" className={cn('grid size-9 place-items-center rounded-xl', WASH[tone])}>
        <Icon className="size-4" />
      </span>
      <p
        className={cn(
          'mt-3 font-bold text-fg tabular-nums',
          small ? 'text-[length:var(--fs-text-base)]' : 'text-[length:var(--fs-title-3)]',
        )}
      >
        {value}
      </p>
      <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{label}</p>
      {hint ? <p className="mt-0.5 text-[length:var(--fs-text-xs)] text-fg-faint tabular-nums">{hint}</p> : null}
    </div>
  );
}

function Shortcut({
  href,
  icon: Icon,
  tone,
  title,
  body,
}: {
  href: string;
  icon: typeof Clock;
  tone: keyof typeof WASH;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      replace
      scroll={false}
      className="group flex items-start gap-3 rounded-2xl border border-line bg-surface-2 p-4 transition-colors duration-[160ms] ease-out hover:border-accent/50"
    >
      <span aria-hidden="true" className={cn('grid size-10 shrink-0 place-items-center rounded-xl', WASH[tone])}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 font-semibold text-fg">
          {title}
          <ChevronLeft
            className="size-4 text-fg-faint transition-transform duration-[160ms] ease-out group-hover:-translate-x-0.5"
            aria-hidden="true"
          />
        </span>
        <span className="mt-0.5 block text-[length:var(--fs-text-xs)] leading-relaxed text-fg-muted">{body}</span>
      </span>
    </Link>
  );
}

/** The profile fields worth knowing in a conversation. Editing stays on the
 *  student page («الصفحة الكاملة») — a form in a drawer over a chat is the
 *  place a stray keystroke rewrites a phone number. */
function Info({ student }: { student: AdminStudentDetail }) {
  const none = c.overview.notRecorded;
  const rows: { icon: typeof Clock; label: string; value: string | null; ltr?: boolean }[] = [
    {
      icon: MapPin,
      label: c.overview.governorate,
      value: [student.governorateNameAr, student.cityNameAr].filter(Boolean).join(' · ') || null,
    },
    { icon: School, label: c.overview.school, value: student.schoolName },
    {
      icon: GraduationCap,
      label: c.overview.stream,
      value: student.schoolStream ? copy.stream[student.schoolStream] : null,
    },
    {
      icon: BookOpen,
      label: c.overview.studyType,
      value: student.studyType ? copy.admin.centers.student.studyTypes[student.studyType] : null,
    },
    {
      icon: Building2,
      label: c.overview.attendance,
      value: student.attendanceMode ? copy.admin.centers.student.attendanceModes[student.attendanceMode] : null,
    },
    { icon: Phone, label: c.overview.fatherPhone, value: student.fatherPhone, ltr: true },
    { icon: Mail, label: c.overview.email, value: student.email, ltr: true },
  ];

  return (
    <section className="rounded-2xl border border-line bg-surface-2 p-4">
      <h3 className="mb-3 font-semibold text-fg">{c.overview.infoTitle}</h3>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(({ icon: Icon, label, value, ltr }) => (
          <div key={label} className="flex items-start gap-2.5">
            <Icon className="mt-0.5 size-4 shrink-0 text-fg-faint" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-[length:var(--fs-text-xs)] text-fg-muted">{label}</dt>
              <dd
                className={cn(
                  'mt-0.5 break-words text-[length:var(--fs-text-sm)]',
                  value ? 'text-fg' : 'text-fg-faint',
                  value && ltr && 'mono',
                )}
              >
                {/* A phone or an address inside Arabic flips without its own
                    direction (CLAUDE.md §7). */}
                {value && ltr ? <bdi dir="ltr">{value}</bdi> : (value ?? none)}
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((tile) => (
        <div key={tile} className="rounded-2xl border border-line bg-surface-2 p-4">
          <Skeleton className="size-9 rounded-xl" />
          <Skeleton width="wide" className="mt-3 h-6" />
          <Skeleton width="narrow" className="mt-2 h-3" />
        </div>
      ))}
    </div>
  );
}
