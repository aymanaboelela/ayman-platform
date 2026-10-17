import Link from 'next/link';
import { CalendarClock, ChevronLeft, ClipboardCheck, GraduationCap } from 'lucide-react';
import type { AdminAttemptQuizSummary, AttemptQuizKind } from '@ayman/contracts/admin/attempts';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { formatCairoShort } from '@/components/admin/exams/exam-time';
import { wholePercent } from './format';
import { KIND_WASH, WASH, kindLabel } from './labels';
import { quizHref, type OverviewParams } from './nav';

const b = copy.quizAdmin.board;

const KIND_ICON: Record<AttemptQuizKind, typeof ClipboardCheck> = {
  lecture_quiz: ClipboardCheck,
  course_exam: GraduationCap,
  monthly_exam: CalendarClock,
};

const CHIP = 'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 font-medium';

/** «كويز المحاضرة ٣» / «الامتحان الشامل» / «امتحان الشهر» — what the paper IS,
 *  in the colour of its kind. */
export function KindChip({ kind, lectureNumber }: { kind: AttemptQuizKind; lectureNumber: number | null }) {
  return <span className={cn(CHIP, WASH[KIND_WASH[kind]])}>{kindLabel(kind, lectureNumber)}</span>;
}

/**
 * One quiz on the overview: what it is, how it went, and the way in.
 *
 * The same object `/admin/homework` draws for a lecture — a container with an
 * icon well, the title as written, a row of count chips and a button — so the
 * two queues a teacher works through read alike.
 *
 * A STRETCHED link opens the quiz, the shape the homework card uses; the
 * «محتاج تصحيح» chip is its own link above it (`z-10`) straight onto that
 * tab, because a paper waiting on its marker is the one thing on this card
 * that wants something from him.
 */
export function QuizCard({ quiz, back }: { quiz: AdminAttemptQuizSummary; back: OverviewParams }) {
  const Icon = KIND_ICON[quiz.kind];
  const sat = quiz.attempts > 0;
  const waiting = quiz.pendingReview > 0;

  return (
    <div
      className={cn(
        // `flex-wrap`: on a phone the button drops under the text at full
        // width instead of squeezing the title to «كويز الدرس التا…».
        'relative flex h-full flex-wrap items-center gap-3 rounded-xl border bg-surface-2 p-4',
        'transition-colors duration-[160ms] ease-out hover:border-accent/50 focus-within:border-accent/50',
        waiting ? 'border-accent/40' : 'border-line',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('grid size-10 shrink-0 place-items-center rounded-lg', WASH[KIND_WASH[quiz.kind]])}
      >
        <Icon className="size-5" />
      </span>

      <div className="min-w-0 flex-1 basis-56">
        <div className="flex flex-wrap items-center gap-1.5 text-[length:var(--fs-text-xs)]">
          <KindChip kind={quiz.kind} lectureNumber={quiz.lectureNumber} />
          {!quiz.published ? <span className={cn(CHIP, WASH.neutral)}>{b.unpublished}</span> : null}
        </div>
        <p className="mt-1 line-clamp-2 text-[length:var(--fs-text-base)] font-semibold text-fg">{quiz.lessonTitle}</p>

        {sat ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[length:var(--fs-text-xs)] tabular-nums">
            <span className={cn(CHIP, WASH.neutral)}>{formatCopy(b.attempts, { n: quiz.attempts })}</span>
            <span className={cn(CHIP, WASH.neutral)}>{formatCopy(b.students, { n: quiz.students })}</span>
            {quiz.averagePercent !== null ? (
              <span className={cn(CHIP, WASH.ok)}>
                {formatCopy(b.average, { n: wholePercent(quiz.averagePercent) })}
              </span>
            ) : null}
            {quiz.passRatePercent !== null ? (
              <span className={cn(CHIP, WASH.ok)}>
                {formatCopy(b.passRate, { n: wholePercent(quiz.passRatePercent) })}
              </span>
            ) : null}
            {waiting ? (
              <Link
                href={quizHref({ quizId: quiz.quizId, state: 'pending_review', back })}
                className={cn(CHIP, WASH.accent, 'relative z-10 underline-offset-2 hover:underline')}
              >
                {formatCopy(b.pending, { n: quiz.pendingReview })}
              </Link>
            ) : null}
            {quiz.inProgress > 0 ? (
              <span className={cn(CHIP, WASH.info)}>{formatCopy(b.live, { n: quiz.inProgress })}</span>
            ) : null}
            {quiz.lastActivityAt ? (
              <span className="whitespace-nowrap text-fg-muted">
                {formatCopy(b.lastActivity, { at: formatCairoShort(quiz.lastActivityAt) })}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="mt-1.5 text-[length:var(--fs-text-xs)] text-fg-muted">{b.noAttempts}</p>
        )}
      </div>

      <Link
        href={quizHref({ quizId: quiz.quizId, back })}
        className={cn(
          'chip shrink-0 justify-center after:absolute after:inset-0 after:content-[\'\'] max-sm:w-full',
          sat ? 'chip--solid' : 'chip--quiet',
        )}
      >
        {b.open}
        <ChevronLeft className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
