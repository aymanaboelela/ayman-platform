import Link from 'next/link';
import { Ban, CheckCircle2, Hourglass, PenLine, Timer } from 'lucide-react';
import type { AdminAttemptRow, AdminAttemptState } from '@ayman/contracts/admin/attempts';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy, formatMark } from '@ayman/contracts/format';
import { Badge } from '@ayman/ui/components/badge';
import { cn } from '@ayman/ui/lib/cn';
import { AttemptActions } from '@/components/admin/quiz/attempt-actions';
import { formatCairoShort } from '@/components/admin/exams/exam-time';
import { formatHoursMinutes } from '@/lib/format';
import { AttemptReviewDialog } from '../outreach/attempt-review-dialog';
import { sittingSeconds, wholePercent } from './format';
import { STATE_LABEL, STATE_WASH, WASH } from './labels';
import { quizHref, type OverviewParams } from './nav';
import { KindChip } from './quiz-card';

const b = copy.quizAdmin.board;

const STATE_ICON: Record<AdminAttemptState, typeof Timer> = {
  in_progress: Timer,
  overdue: Hourglass,
  submitted: CheckCircle2,
  pending_review: PenLine,
  abandoned: Ban,
};

/** What the signed-in operator may do to a sitting — the two write
 *  permissions behind the row's buttons. Reading a paper needs nothing beyond
 *  `attempt:read`, which this page already required to render at all. */
export interface AttemptRowAbilities {
  /** `attempt:grade` — «تصحيح الورقة». */
  grade: boolean;
  /** `attempt:unlock` — reopen, extra time, extra attempt. */
  unlock: boolean;
}

const STATE_BADGE: Record<AdminAttemptState, 'neutral' | 'ok' | 'warn' | 'accent'> = {
  in_progress: 'neutral',
  overdue: 'warn',
  submitted: 'ok',
  pending_review: 'accent',
  abandoned: 'neutral',
};

/**
 * One sitting: who, which attempt, how it went, and what to do about it.
 *
 * `context` is set on the overview's student search, where rows from many
 * quizzes sit in one list and each has to say which paper it was — its title
 * links into that quiz, still filtered to the same search. Inside one quiz
 * the header already says it, and repeating it on fifty rows is noise.
 *
 * The actions are the ones the old table had, rearranged by what they cost:
 * marking and reading the paper are on the row; reopening, extra time and an
 * extra attempt — rarer, and each a change to the student's sitting — are one
 * press further, under «إجراءات تانية».
 *
 * Each renders only for the permission the API checks behind it (`can`), the
 * rule `/admin/centers` follows: an assistant who may read sittings but not
 * mark them never meets a «تصحيح الورقة» that opens onto a 403.
 */
export function AttemptRow({
  row,
  can,
  context,
}: {
  row: AdminAttemptRow;
  can: AttemptRowAbilities;
  context?: { back: OverviewParams; q?: string };
}) {
  const Icon = STATE_ICON[row.state];
  const seconds = sittingSeconds(row.startedAt, row.submittedAt);
  const paper = row.state === 'submitted' || row.state === 'pending_review';
  const grade = row.state === 'pending_review' && can.grade;

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border bg-surface-2 p-4',
        row.state === 'pending_review' ? 'border-accent/40' : 'border-line',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('grid size-10 shrink-0 place-items-center rounded-lg', WASH[STATE_WASH[row.state]])}
      >
        <Icon className="size-5" />
      </span>

      {/* Everything after the icon is ONE column, so on a phone the mark and
          the buttons line up under the name instead of under the icon. */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 basis-52">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link
                href={`/admin/students/${row.userId}`}
                className="text-[length:var(--fs-text-base)] font-semibold text-fg underline-offset-2 hover:underline"
              >
                {row.studentName}
              </Link>
              <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted tabular-nums">
                {formatCopy(b.attemptNo, { n: row.attemptNumber })}
              </span>
              {row.paper === 'improvement' ? (
                <span
                  className={cn('rounded-full px-2 py-0.5 text-[length:var(--fs-text-xs)] font-medium', WASH.accent)}
                >
                  {b.improvementPaper}
                </span>
              ) : null}
              <Badge tone={STATE_BADGE[row.state]}>{STATE_LABEL[row.state]}</Badge>
            </div>

            {context ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-muted">
                <KindChip kind={row.kind} lectureNumber={null} />
                <Link
                  href={quizHref({ quizId: row.quizId, q: context.q, back: context.back })}
                  className="font-medium text-fg underline-offset-2 hover:underline"
                >
                  {row.lessonTitle}
                </Link>
                <span>
                  {row.courseTitle} · {row.sectionTitle}
                </span>
              </div>
            ) : null}

            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-muted tabular-nums">
              <span className="whitespace-nowrap">
                {formatCopy(b.started, { at: formatCairoShort(row.startedAt) })}
              </span>
              {row.submittedAt ? (
                <span className="whitespace-nowrap">
                  {formatCopy(b.submitted, { at: formatCairoShort(row.submittedAt) })}
                </span>
              ) : null}
              {seconds !== null ? (
                <span className="whitespace-nowrap">
                  {formatCopy(b.duration, { d: formatHoursMinutes(seconds) })}
                </span>
              ) : null}
            </p>
          </div>

          <AttemptScore row={row} />
        </div>

        {grade || paper || can.unlock ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {grade ? (
              <Link href={`/admin/grading/${row.id}`} className="chip chip--solid">
                {b.grade}
              </Link>
            ) : null}
            {/* «شوف ورقته» — the outreach log's own popup, reused rather than
                rebuilt: it renders the paper through the student's
                `ReviewQuestion`, so the instructor sees the picture the
                student sees. Only for a handed-in paper; an open one has
                nothing final to show. */}
            {paper ? <AttemptReviewDialog attemptId={row.id} /> : null}
            {/* Opened, it takes the whole line: the minutes box and three
                buttons do not fit beside the two above on a phone. */}
            {can.unlock ? (
              <details className="min-w-0 open:basis-full">
                <summary className="cursor-pointer select-none rounded-md px-1 py-1 text-[length:var(--fs-text-xs)] text-fg-muted hover:text-fg">
                  {b.moreActions}
                </summary>
                <div className="mt-2">
                  <AttemptActions
                    attemptId={row.id}
                    quizId={row.quizId}
                    userId={row.userId}
                    canReopen={paper}
                  />
                </div>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The mark, out of the sitting's own scale, with the verdict in words beside
 * its colour.
 *
 * A paper waiting on an essay shows NO number: its score counts the unmarked
 * essay as zero, and «٤٨ من ١٠٠» with a red chip beside it is a fail nobody
 * has decided yet. The API sends `percent: null` for exactly that case.
 */
function AttemptScore({ row }: { row: AdminAttemptRow }) {
  if (row.state === 'pending_review') {
    return (
      <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[length:var(--fs-text-xs)] font-medium', WASH.accent)}>
        {b.pendingScore}
      </span>
    );
  }
  if (row.percent === null || row.score === null) {
    return (
      <span aria-hidden="true" className="shrink-0 text-[length:var(--fs-text-sm)] text-fg-faint">
        —
      </span>
    );
  }
  const passed = row.passed === true;
  return (
    // A row on a phone (mark and verdict side by side under the name), a
    // column beside the name once there is room for one.
    <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end sm:gap-1 sm:text-end">
      <span className="text-[length:var(--fs-text-base)] font-semibold text-fg tabular-nums">
        {formatCopy(b.scoreOf, { score: formatMark(row.score), outOf: formatMark(row.gradeOutOf) })}
      </span>
      <span
        className={cn(
          'whitespace-nowrap rounded-full px-2 py-0.5 text-[length:var(--fs-text-xs)] font-medium tabular-nums',
          row.passed === null ? WASH.neutral : passed ? WASH.ok : WASH.err,
        )}
      >
        {formatCopy(b.percent, { n: wholePercent(row.percent) })}
        {row.passed === null ? null : <> · {passed ? b.verdictPass : b.verdictFail}</>}
      </span>
    </div>
  );
}
