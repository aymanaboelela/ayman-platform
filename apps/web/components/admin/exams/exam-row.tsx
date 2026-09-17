import Link from 'next/link';
import { SquarePen, Timer, Users } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import type { AdminExamRow } from '@ayman/contracts/admin/exams';
import type { ExamPhase } from '@ayman/contracts/quiz/scheduled';
import { cn } from '@ayman/ui/lib/cn';
import { formatHoursMinutes } from '@/lib/format';
import { ExamRowActions } from './exam-row-actions';
import type { ExamCourseOption } from './exam-form';
import { formatCairoShort } from './exam-time';

const c = copy.admin.monthlyExams;

const PHASE_LABEL: Record<ExamPhase, string> = {
  upcoming: c.phaseUpcoming,
  open: c.phaseOpen,
  closed: c.phaseClosed,
};

/**
 * The colour rule, applied to the one thing on the row that is a STATE.
 *
 * `open` is amber because amber is «انت هنا» as well as «اضغط» — this is the
 * exam students are sitting right now and it is the row he came to the screen
 * for. `upcoming` is ember: announced, structural, not yet anything to act on.
 * `closed` is plain neutral, because history should recede.
 *
 * Green and red appear nowhere on this row. They mean "right answer" and "wrong
 * answer" on this platform and nothing else — a closed exam is not a failure.
 */
const PHASE_TONE: Record<ExamPhase, string> = {
  open: 'border-[color-mix(in_oklch,var(--a-9)_45%,transparent)] bg-[color-mix(in_oklch,var(--a-9)_10%,transparent)] text-accent-text',
  upcoming: 'border-study-line bg-study-tint text-study',
  closed: 'border-line bg-surface-3 text-fg-faint',
};

/**
 * One exam, across every course.
 *
 * ## What the row has to answer in one glance
 *
 * «إيه اللي نازل ومتى؟» — course, name, phase, window, and whether anything is
 * blocking it. The two facts that read like a broken site if they are not on
 * screen come LAST and LOUDEST, because both are silent everywhere else:
 *
 *  · `shelfUnpublished` — `LessonAccessService.resolve` does NOT check
 *    `section.isPublished` while `LessonGateService.resolveCourse` DOES, so an
 *    unpublished «امتحانات الشهر» shelf 404s the intro page for every student
 *    while `assertCanAttempt` keeps opening attempts. Total failure, no error
 *    anywhere, at 20:01.
 *
 *  · `needsGradingCount` — until an essay is marked it counts ZERO, and that
 *    zero is real to every aggregate on the platform: the student's score, the
 *    course average, the ranking. It is not "pending", it is wrong.
 *
 * ## The window is printed in Cairo, always
 *
 * Never in the reader's own timezone. See `exam-time.ts` — an admin abroad and
 * an admin in Cairo must read one number, and it must be the one the student
 * will experience.
 */
export function ExamRow({
  row,
  courses,
}: {
  row: AdminExamRow;
  /** Every course except this exam's own, for «كرره على كورسات تانية». */
  courses: readonly ExamCourseOption[];
}) {
  const published = row.quizPublished && row.lessonPublished;

  return (
    <div
      className={cn(
        'rounded-xl border bg-surface-2 p-4',
        'transition-colors duration-[160ms] ease-out hover:border-accent/40',
        row.phase === 'open' ? 'border-accent/40' : 'border-line',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[length:var(--fs-text-xs)] text-fg-muted">
            {row.courseTitle}
          </p>

          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            {/* The title opens the exam's own settings — the window, the
                syllabus and the marks. «حط الأسئلة» in the action cluster is
                the other half, and goes to the paper. */}
            <Link
              href={`/admin/exams/${row.lessonId}`}
              className="text-[length:var(--fs-text-base)] font-semibold text-fg underline-offset-2 hover:underline"
            >
              {row.title}
            </Link>

            <span
              className={cn(
                'mono rounded-full border px-2 py-0.5 text-[length:var(--fs-mono-label)] font-medium',
                PHASE_TONE[row.phase],
              )}
            >
              {PHASE_LABEL[row.phase]}
            </span>

            {/* Ember for «منشور», neutral for «لسه مسودة» — publication is a
                state of the content, not an action and not a right answer. */}
            <span
              className={cn(
                'rounded-full border px-2 py-0.5 text-[length:var(--fs-mono-label)]',
                published
                  ? 'border-study-line bg-study-tint text-study'
                  : 'border-line text-fg-muted',
              )}
            >
              {published ? c.published : c.draft}
            </span>
          </div>

          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-muted">
            {row.opensAt ? (
              <span className="tabular-nums">
                {c.opensAtLabel} {formatCairoShort(row.opensAt)}
              </span>
            ) : null}
            {row.closesAt ? (
              <span className="tabular-nums">
                {c.closesAtLabel} {formatCairoShort(row.closesAt)}
              </span>
            ) : null}
            {row.durationMinutes !== null ? (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Timer className="size-3.5" aria-hidden="true" />
                <span className="sr-only">{c.durationLabel}</span>
                {formatHoursMinutes(row.durationMinutes * 60)}
              </span>
            ) : null}
            <span className="tabular-nums">
              {c.gradeOutOfLabel} {row.gradeOutOf}
            </span>
            <span className="tabular-nums">
              {row.questionCount === 0 ? (
                c.noQuestions
              ) : (
                <>
                  {row.questionCount} {c.questionCount}
                </>
              )}
            </span>
            {row.attemptCount > 0 ? (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Users className="size-3.5" aria-hidden="true" />
                {formatCopy(c.attempts, { n: row.attemptCount })}
              </span>
            ) : null}
          </p>

          {/* The syllabus, as the student reads it. Titles only — a covered
              lesson is a statement about scope, not a link. */}
          {row.coveredLessons.length > 0 ? (
            <p className="mt-1 truncate text-[length:var(--fs-text-xs)] text-fg-faint">
              {row.coveredLessons.map((lesson) => lesson.title).join(' · ')}
            </p>
          ) : null}
        </div>

        <ExamRowActions row={row} courses={courses} />
      </div>

      {/* ── the two things that are silent everywhere else ──────────────── */}

      {row.needsGradingCount > 0 ? (
        <Link
          href="/admin/grading"
          className={cn(
            'mt-3 flex items-center gap-2 rounded-sm border px-3 py-2',
            'text-[length:var(--fs-text-sm)] font-medium',
            'border-[color-mix(in_oklch,var(--a-9)_45%,transparent)]',
            'bg-[color-mix(in_oklch,var(--a-9)_10%,transparent)] text-accent-text',
            'transition-colors duration-[160ms] ease-out hover:bg-[color-mix(in_oklch,var(--a-9)_18%,transparent)]',
          )}
        >
          <SquarePen className="size-4 shrink-0" aria-hidden="true" />
          {formatCopy(c.needsGrading, { n: row.needsGradingCount })}
        </Link>
      ) : null}

      {/* No lucide icon beside this one, deliberately: `shelfUnpublished`
          already opens with its own warning mark, and a second one next to it
          reads as two separate alarms on one sentence. Every other marker on
          this screen is a lucide component. */}
      {!row.sectionPublished ? (
        <p
          role="alert"
          className={cn(
            'mt-2 rounded-sm border px-3 py-2 text-[length:var(--fs-text-sm)]',
            'border-[color-mix(in_oklch,var(--warn),transparent_60%)]',
            'bg-[color-mix(in_oklch,var(--warn),transparent_90%)] text-[color:var(--warn)]',
          )}
        >
          {c.shelfUnpublished}
        </p>
      ) : null}
    </div>
  );
}
