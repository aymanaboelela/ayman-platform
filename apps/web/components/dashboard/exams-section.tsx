import Link from 'next/link';
import { GraduationCap, Sparkles, Trophy } from 'lucide-react';
import { copy, formatCopy, type QuizHistoryRow } from '@ayman/contracts';
import { ChevronForward } from '@/components/player/icons';
import { quizHref, reviewHref } from '@/lib/quiz-links';
import { SpotIllustration } from './spot-illustration';

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
 * Per `study.css`: ember for structure, amber for what you press, and
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
            {formatCopy(copy.library.courseCount, { n: quizzes.length })}
          </span>
        ) : null}
      </div>

      {quizzes.length === 0 ? (
        <div className="empty">
          <SpotIllustration name="exams" />
          <p className="empty__body">{c.examsEmpty}</p>
          <div className="empty__action">
            <Link href="/path" className="chip chip--quiet">
              {c.examsEmptyCta}
            </Link>
          </div>
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
    <div className={`attempt-row${canImprove ? ' attempt-row--action' : ''}`}>
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

      {/*
        The PASS verdict only.

        `verdict--fail` used to render here too — «محتاج تحاول تاني», in `--err`
        red, on the student's own home screen, next to a percentage that had
        already said the same thing. A student who is behind opens this page and
        the first colour on it was a red label per exam, permanently, with no
        action attached to it: `canImprove` is false on exactly these rows, so
        the red badge sat beside a «راجع إجاباتك» chip and was not a route to
        anywhere. It marked them rather than telling them anything.

        The mark itself is unchanged and still on the row — `bestPercent` is
        printed in `attempt-row__meta` two lines up, and the review is one press
        away. What is gone is the second, redder statement of it.

        The pass badge stays: green on a row that earned it is the encouragement
        half of the same pair, and it is the only green on this screen.
      */}
      {row.passed === true ? (
        <span className="verdict verdict--pass">{copy.quiz.passed}</span>
      ) : null}

      {/*
        `chip--done` rather than `chip--quiet` for the review action — ember
        tint, the same treatment «راجع» wears on a finished lesson row, which is
        the identical gesture on the identical kind of object. Amber stays
        reserved for `canImprove`, so this row still has exactly one loud state
        and it is the one with somewhere to go.
      */}
      <span className={canImprove ? 'chip chip--solid' : 'chip chip--done'}>
        {canImprove ? copy.quiz.improveExam : copy.quiz.reviewAnswers}
      </span>
    </div>
  );
}
