import Link from 'next/link';
import { GraduationCap, Sparkles, Trophy } from 'lucide-react';
import { copy, formatCopy, type QuizHistoryRow } from '@ayman/contracts';
import { ChevronForward } from '@/components/player/icons';
import { quizHref, reviewHref } from '@/lib/quiz-links';

const c = copy.dashboard;

/** How many rows the dashboard shows before deferring to `/results`. */
const SHOWN = 4;

/**
 * «امتحاناتك» — the exam block on the student's home screen.
 *
 * ## Why it exists at all
 *
 * The dashboard's only account of a student's marks was a five-item score
 * strip in the right-hand rail: a percentage and a title, with nothing to
 * press. It answered "what did I get" and nothing else — not whether they
 * passed, not which exam still has an improvement sitting waiting, and not
 * where to go about either. Those are the questions a student opens this page
 * with, and the answer to all three is one row each.
 *
 * ## Every row ends in its own action
 *
 * That is the shape `.lesson-row` established across the study surface, and it
 * is what turns a list into something you can act on. A row whose exam still
 * has an improvement sitting shows «ادخل امتحان التحسين» in amber; every other
 * row shows «راجع إجاباتك» in the quiet variant. Exactly one kind of row is
 * ever the loud one, so the page still has a clear next thing to do.
 *
 * ## Colour
 *
 * Per `study.css`: violet for structure, amber for what you press, and
 * green/red ONLY for the quiz's own verdict — which is what `.verdict` is.
 * This is the one screen outside the runner where those two hues are earned.
 *
 * ## Ordering
 *
 * `quizzes` arrives most-recently-sat first from `QuizHistoryService`, and is
 * rendered in that order rather than re-sorted by "needs attention". A list
 * that reorders itself between visits is one a student has to re-read every
 * time; the improvement rows are already marked by colour and by their chip.
 */
export function ExamsSection({ quizzes }: { quizzes: readonly QuizHistoryRow[] }) {
  return (
    <section>
      <div className="group-head">
        <span className="group-head__mark" aria-hidden="true" />
        <h2 className="group-head__title">{c.examsTitle}</h2>
        {quizzes.length > SHOWN ? (
          <span className="group-head__count">
            {formatCopy(copy.results.attemptsOf, { used: SHOWN, max: quizzes.length })}
          </span>
        ) : null}
      </div>

      {quizzes.length === 0 ? (
        /*
          Violet-tinted rather than a dashed grey box, for the reason the
          courses empty state gives: an empty container is structure, and a
          dashed rectangle is indistinguishable from something that failed to
          load.
        */
        <div className="rounded-lg border border-study-line bg-study-tint px-5 py-8 text-center">
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.examsEmpty}</p>
          <Link href="/path" className="chip chip--quiet mt-4 inline-flex">
            {c.examsEmptyCta}
          </Link>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {quizzes.slice(0, SHOWN).map((row) => (
              <li key={row.lessonId}>
                <ExamRow row={row} />
              </li>
            ))}
          </ul>

          {quizzes.length > SHOWN ? (
            <Link
              href="/results"
              className="mt-3 inline-flex items-center gap-1 text-[length:var(--fs-text-sm)] text-accent-text transition-colors duration-[160ms] ease-out hover:underline"
            >
              {c.examsAll}
              <ChevronForward />
            </Link>
          ) : null}
        </>
      )}
    </section>
  );
}

function ExamRow({ row }: { row: QuizHistoryRow }) {
  /*
   * Both flags, not one. A quiz that never offered an improvement sitting and
   * an exam whose sitting is spent are different states, and collapsing them
   * into a single truthiness check is what would offer a second chance on a
   * lecture quiz that does not have one.
   */
  const canImprove = row.allowsImprovement && !row.improvementUsed;

  return (
    <div className={`attempt-row${canImprove ? ' attempt-row--counts' : ''}`}>
      <span className="attempt-row__well" aria-hidden="true">
        {canImprove ? (
          <Sparkles className="size-[1.125rem]" />
        ) : row.passed ? (
          <Trophy className="size-[1.125rem]" />
        ) : (
          <GraduationCap className="size-[1.125rem]" />
        )}
      </span>

      <span className="attempt-row__text">
        <Link
          href={canImprove ? quizHref(row.lessonId) : reviewHref(row.lessonId, row.latestAttemptId)}
          className="attempt-row__title after:absolute after:inset-0 after:content-['']"
        >
          {row.quizTitle}
        </Link>
        <span className="attempt-row__meta">
          {row.bestPercent === null ? copy.quiz.essayPending : `${row.bestPercent}%`}
          {canImprove ? ` · ${c.examsImproveHint}` : ''}
        </span>
      </span>

      {row.passed !== null ? (
        <span className={`verdict verdict--${row.passed ? 'pass' : 'fail'}`}>
          {row.passed ? copy.quiz.passed : copy.quiz.failed}
        </span>
      ) : null}

      <span className={canImprove ? 'chip chip--solid' : 'chip chip--quiet'}>
        {canImprove ? copy.quiz.improveExam : copy.quiz.reviewAnswers}
      </span>
    </div>
  );
}
