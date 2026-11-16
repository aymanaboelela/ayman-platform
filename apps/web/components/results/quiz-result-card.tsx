import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  Equal,
  Hourglass,
  Sparkles,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { copy, formatCopy, type QuizHistoryRow } from '@ayman/contracts';
import { formatDay, verdictOf, type Verdict } from '@/lib/results-view';
import { quizHref, reviewHref } from '@/lib/quiz-links';
import { IsolatedFigures } from './isolated-figures';

const c = copy.results;

/**
 * The score tile's colour — good / warn / bad — per VERDICT.
 *
 * ## ⚠️ The verdict is `passed`, never a percentage compared to 50
 *
 * Each quiz carries its own `passPercent` — the live foundation exam's is
 * **70** — and `QuizHistoryRow.passed` is the server's answer, computed from
 * the BEST attempt against that quiz's own mark. An earlier card coloured on
 * `percent >= 50`, so every score from 50 to 69 was green here while the
 * dashboard, the lesson and the student's actual grade all said failed.
 *
 * `passed` is nullable (an essay still awaiting grading has no verdict yet),
 * and null is the amber «بتتصحّح» tile — never red.
 */
export const TILE_TONE: Record<Verdict, 'good' | 'warn' | 'bad'> = {
  excellent: 'good',
  passed: 'good',
  failed: 'bad',
  pending: 'warn',
};

/** Which filter chip a row answers to (`ResultsList`). */
export const FILTER_OF: Record<Verdict, 'passed' | 'failed' | 'pending'> = {
  excellent: 'passed',
  passed: 'passed',
  failed: 'failed',
  pending: 'pending',
};

const STATUS: Record<Verdict, { icon: LucideIcon; label: string }> = {
  excellent: { icon: Check, label: c.verdictPassed },
  passed: { icon: Check, label: c.verdictPassed },
  // `copy.quiz.failed` — «محتاجة مراجعة» — is a STATE with a way forward,
  // and it is the word the quiz's own result screen uses. The row must not
  // say something harsher about the same sitting.
  failed: { icon: BookOpen, label: copy.quiz.failed },
  pending: { icon: Hourglass, label: copy.quiz.pendingNotFinal },
};

/**
 * One exam the student has sat, as the board's row: a coloured score tile,
 * the title, a quiet meta line, the verdict in words, and «مراجعة».
 *
 * ## The score is the BEST sitting
 *
 * `best` is what COUNTS — the higher of the two sittings is the grade. When
 * there was a second sitting, «آخر محاولة» follows the verdict with its arrow
 * (`delta`: latest minus the one before), because showing only the best
 * hides a decline. A fall is quiet grey, never red: the best still counts.
 * With ONE sitting the two are the same attempt and «آخر محاولة» is not
 * printed at all.
 *
 * ## The review link is unconditional
 *
 * It always renders, even when the review window is closed: the review route
 * resolves the 4×7 matrix SERVER-SIDE and renders a designed `<ReviewLocked>`
 * when the window forbids it, so the link can never leak and never dead-ends.
 * Its visible word is the board's short «مراجعة»; its accessible name is the
 * full «مراجعة الإجابات: <exam>», so a screen reader's link list tells the
 * rows apart (and `student-results.e2e.ts` still finds it by «مراجعة الإجابات»).
 *
 * The improvement sitting is NOT a button here — the highlighted card above
 * the list (`ImproveCard`) owns the page's one orange button. The row says
 * «امتحان التحسين متاح» in its status line instead.
 */
export function QuizResultCard({
  row,
  delta = null,
  showCourse = false,
}: {
  row: QuizHistoryRow;
  delta?: number | null;
  /** On when the student has sat exams in more than one course. */
  showCourse?: boolean;
}) {
  const verdict = verdictOf(row);
  const Icon = STATUS[verdict].icon;
  const canImprove = row.allowsImprovement && !row.improvementUsed;

  return (
    <li className="rs-exam" data-verdict={verdict} data-filter={FILTER_OF[verdict]}>
      <span className="rs-score rs-ltr" data-tone={TILE_TONE[verdict]}>
        {row.bestPercent === null ? '—' : `${row.bestPercent}%`}
      </span>

      <div className="rs-exam__tx">
        <h3 className="rs-exam__title">{row.quizTitle}</h3>
        <p className="rs-exam__meta">
          {showCourse ? (
            <>
              <span className="rs-exam__course">{row.courseTitle}</span>
              <span aria-hidden="true"> · </span>
            </>
          ) : null}
          <time dateTime={row.lastSubmittedAt}>{formatDay(row.lastSubmittedAt)}</time>
        </p>
        <p className="rs-exam__status" data-tone={TILE_TONE[verdict]}>
          <Icon className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{STATUS[verdict].label}</span>
          {verdict === 'excellent' ? (
            <span className="rs-exam__star">
              <Star className="size-3.5" aria-hidden="true" />
              {c.verdictExcellent}
            </span>
          ) : null}
          {canImprove ? (
            <span className="rs-exam__open">
              <Sparkles className="size-3.5" aria-hidden="true" />
              {c.improveOpen}
            </span>
          ) : null}
          {row.attemptsUsed > 1 && row.latestPercent !== null ? (
            <span className="rs-exam__latest">
              <IsolatedFigures text={formatCopy(c.latestShort, { score: row.latestPercent })} />
              {delta === null ? null : <Delta delta={delta} />}
            </span>
          ) : null}
        </p>
      </div>

      <Link
        href={reviewHref(row.lessonId, row.latestAttemptId)}
        className="rs-btn rs-btn--quiet"
        aria-label={formatCopy(c.reviewRowLabel, { title: row.quizTitle })}
      >
        {c.reviewShort}
      </Link>
    </li>
  );
}

/**
 * «فرصة تحسين» — the one exam whose improvement sitting is still unused,
 * lifted out of the list onto a dark card with the page's ONE orange button.
 *
 * To the quiz's own intro page, not straight into a new attempt: starting a
 * graded exam is not something a link should do on a mis-tap — that page
 * states the paper, the marks and the attempts left, and owns the button that
 * actually creates one. The label is `copy.quiz.improveExam` (a noun), not the
 * board's «حسّن درجتك», which only addresses a boy.
 */
export function ImproveCard({ row }: { row: QuizHistoryRow }) {
  const verdict = verdictOf(row);
  return (
    <article className="rs-improve" aria-labelledby="rs-improve-title">
      <div className="rs-improve__id">
        <span className="rs-score rs-score--lg rs-ltr" data-tone={TILE_TONE[verdict]}>
          {row.bestPercent === null ? '—' : `${row.bestPercent}%`}
        </span>
        <div className="rs-improve__words">
          <span className="rs-improve__badge">{c.improveBadge}</span>
          <h3 id="rs-improve-title" className="rs-improve__title">
            {row.quizTitle}
          </h3>
          <p className="rs-improve__meta">{row.courseTitle}</p>
        </div>
      </div>
      <Link href={quizHref(row.lessonId)} className="rs-btn rs-btn--primary rs-improve__cta">
        <Sparkles className="size-4" aria-hidden="true" />
        {copy.quiz.improveExam}
      </Link>
    </article>
  );
}

function Delta({ delta }: { delta: number }) {
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
  const DeltaIcon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : Equal;
  const words = direction === 'up' ? c.deltaUp : direction === 'down' ? c.deltaDown : c.deltaSame;

  return (
    <span className="rs-delta" data-direction={direction}>
      <DeltaIcon className="size-3.5" aria-hidden="true" />
      {direction === 'same' ? null : (
        <span className="rs-ltr" aria-hidden="true">
          {Math.abs(delta)}
        </span>
      )}
      <span className="sr-only">{formatCopy(words, { n: Math.abs(delta) })}</span>
    </span>
  );
}
