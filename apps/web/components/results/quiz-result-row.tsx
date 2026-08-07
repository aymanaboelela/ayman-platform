import Link from 'next/link';
import { copy, formatCopy, type QuizHistoryRow } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { quizHref, reviewHref } from '@/lib/quiz-links';

/**
 * One quiz the student has sat: what they best scored, what they scored last
 * time, how many attempts are left, and the two things they can do about it.
 *
 * ## Why both "best" and "latest"
 *
 * They answer different questions. `best` is what counts — `gradeMethod:
 * highest` means the best sitting is the grade — and `latest` is how it went
 * most recently, which is the one a student checks after a retake. Showing
 * only the best hides a decline; showing only the latest hides a pass.
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
    ? formatCopy(copy.results.attemptsOf, { used: row.attemptsUsed, max: 2 })
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
        <Figure label={copy.results.best} percent={row.bestPercent} tone="verdict" />
        <Figure label={copy.results.latest} percent={row.latestPercent} tone="plain" />
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

      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={reviewHref(row.lessonId, row.latestAttemptId)}
          className={cn(
            'inline-flex h-9 items-center rounded-sm border border-line px-3',
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
              'inline-flex h-9 items-center rounded-sm bg-accent px-3',
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
 * `tone="verdict"` colours against the 50% pass line — green or red. It is
 * used for `best` ONLY, because that is the figure that decides whether the
 * quiz is passed. `latest` stays neutral: colouring a lower recent score red
 * next to a green best would say "you failed" about a quiz the student has
 * already passed.
 */
function Figure({
  label,
  percent,
  tone,
}: {
  label: string;
  percent: number | null;
  tone: 'verdict' | 'plain';
}) {
  return (
    <div>
      <dt className="text-[length:var(--fs-mono-label)] text-fg-muted">{label}</dt>
      <dd
        className={cn(
          'mono tabular text-[length:var(--fs-text-base)] font-medium',
          percent === null
            ? 'text-fg-muted'
            : tone === 'plain'
              ? 'text-fg'
              : percent >= 50
                ? 'text-[color:var(--ok)]'
                : 'text-[color:var(--err)]',
        )}
      >
        {percent === null ? copy.results.noneYet : `${percent}%`}
      </dd>
    </div>
  );
}
