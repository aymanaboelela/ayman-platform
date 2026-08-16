import Link from 'next/link';
import { attemptAllowance, copy, formatCopy, type QuizHistoryRow } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { quizHref, reviewHref } from '@/lib/quiz-links';

/**
 * One quiz the student has sat: what they best scored, what they scored last
 * time, how many attempts are left, and the two things they can do about it.
 *
 * ## Why both "best" and "latest"
 *
 * They answer different questions. `best` is what COUNTS — the higher of the
 * two sittings is the student's grade — and `latest` is how it went most
 * recently, which is the one a student checks after an improvement sitting.
 * Showing only the best hides a decline; showing only the latest hides a pass.
 *
 * ## The review link is unconditional
 *
 * It always renders, even when the review window is closed. The review route
 * resolves the quiz's 4×7 review matrix SERVER-SIDE and renders a designed
 * `<ReviewLocked>` explanation when the window forbids it, so following this
 * link can never leak anything and never dead-ends — a student gets told why,
 * which is strictly better than a link that silently is not there.
 */
export function QuizResultRow({ row }: { row: QuizHistoryRow }) {
  const attempts = row.allowsImprovement
    ? formatCopy(copy.results.attemptsOf, {
        used: row.attemptsUsed,
        // Never a literal 2. The allowance has exactly one home, and a copy of
        // it here is the sort of thing that survives a rule change by weeks.
        max: attemptAllowance(row.allowsImprovement),
      })
    : copy.quiz.singleAttempt;

  /*
   * The ONLY route back into a quiz from this screen. It is not a retake: it
   * exists solely for the final exam's single improvement sitting, and both
   * flags are required because neither implies the other — a quiz that never
   * offered one, and an exam whose one sitting is spent, are different states
   * that must not collapse into one falsy check.
   */
  const canImprove = row.allowsImprovement && !row.improvementUsed;

  return (
    <li className="flex flex-col gap-4 border-b border-line-subtle p-5 last:border-b-0 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[length:var(--fs-text-base)] font-medium text-fg">
          {row.quizTitle}
        </p>
        <p className="truncate text-[length:var(--fs-text-sm)] text-fg-muted">{row.courseTitle}</p>
      </div>

      <dl className="flex shrink-0 items-center gap-5">
        <Figure label={copy.results.best} percent={row.bestPercent} passed={row.passed} />
        <Figure label={copy.results.latest} percent={row.latestPercent} passed={null} />
        <div>
          <dt className="whitespace-nowrap text-[length:var(--fs-mono-label)] text-fg-muted">
            {copy.results.attemptsUsed}
          </dt>
          {/* `whitespace-nowrap`: "من غير حد" is three words in a column sized
              for "٢ من ٣", and it wrapped to three stacked lines that pushed
              the row's height out. It is a value, not prose — it breaks the
              layout before it breaks the line. */}
          <dd className="mono tabular whitespace-nowrap text-[length:var(--fs-text-sm)] text-fg">
            {attempts}
          </dd>
        </div>
      </dl>

      {/* `h-10 md:h-9` on both links below. These are the only two actions on
          this screen, they sit 8px apart at the bottom of every row, and at
          36px they were the last controls here still below a fingertip. 40px
          is not a new number invented for them: it is exactly what study.css
          gives `.chip`, `.review-filter__option` and `.verdict` under
          `max-width: 47.999rem`, and what `Button`'s `sm` size does — the
          same breakpoint Tailwind's `md` names. These two escaped all four of
          those passes only because they are one-off utility strings rather
          than a shared class. Above `md` nothing about the row changes. */}
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={reviewHref(row.lessonId, row.latestAttemptId)}
          className={cn(
            'inline-flex h-10 items-center rounded-sm border border-line px-3 md:h-9',
            'text-[length:var(--fs-text-sm)] text-fg',
            'transition-colors duration-[160ms] ease-out hover:bg-surface-3',
          )}
        >
          {copy.quiz.reviewAnswers}
        </Link>

        {canImprove ? (
          // To the quiz's own intro page, not straight into a new attempt.
          // Starting a graded exam is not something a link should do on hover
          // or on a mis-tap — that page states the duration, the marks and the
          // attempts left, and owns the button that actually creates one.
          <Link
            href={quizHref(row.lessonId)}
            className={cn(
              'inline-flex h-10 items-center rounded-sm bg-accent px-3 md:h-9',
              'text-[length:var(--fs-text-sm)] font-medium text-[#1A1206]',
              'transition-colors duration-[160ms] ease-out hover:bg-accent-hover',
            )}
          >
            {copy.quiz.improveExam}
          </Link>
        ) : (
          // Two different endings. «استعملت محاولة التحسين» is the truthful one
          // for an exam whose second sitting is spent; telling that student
          // "you have already sat this" is technically true and answers a
          // question they did not ask.
          <span className="text-[length:var(--fs-text-sm)] text-fg-faint">
            {row.improvementUsed ? copy.quiz.improveUsed : copy.quiz.noAttemptsLeft}
          </span>
        )}
      </div>
    </li>
  );
}

/**
 * One figure, coloured green or red only when it is a VERDICT.
 *
 * ## ⚠️ The verdict is `passed`, never a percentage compared to 50
 *
 * This used to colour on `percent >= 50`, and 50 is not this platform's pass
 * mark anywhere. Each quiz carries its own `passPercent` — the live foundation
 * exam's is **70** — and `QuizHistoryRow.passed` is the server's answer,
 * computed from the BEST attempt against that quiz's own mark, which is the
 * same value `ExamsSection` and `recordQuizResult` use.
 *
 * So every score from 50 to 69 was printed in GREEN on `/results` while the
 * dashboard, the lesson and the student's actual grade all said failed. The
 * number was right and its colour contradicted every other screen — the worst
 * shape for this particular mistake, because the figure it miscolours is
 * labelled «أحسن» and is the one a student reads as their standing.
 *
 * `passed` is nullable (an attempt awaiting essay grading has no verdict yet),
 * and null reads as neutral rather than as a fail.
 *
 * `latest` passes `null` deliberately, which is not the same thing as "not yet
 * graded" — it is that a lower recent score coloured red next to a green best
 * would say "you failed" about a quiz the student has already passed. Only the
 * figure that DECIDES the grade gets to wear the verdict's colour.
 */
function Figure({
  label,
  percent,
  passed,
}: {
  label: string;
  percent: number | null;
  passed: boolean | null;
}) {
  return (
    <div>
      <dt className="text-[length:var(--fs-mono-label)] text-fg-muted">{label}</dt>
      <dd
        className={cn(
          'mono tabular text-[length:var(--fs-text-base)] font-medium',
          percent === null
            ? 'text-fg-muted'
            : passed === null
              ? 'text-fg'
              : passed
                ? 'text-[color:var(--ok)]'
                : 'text-[color:var(--err)]',
        )}
      >
        {percent === null ? copy.results.noneYet : `${percent}%`}
      </dd>
    </div>
  );
}
