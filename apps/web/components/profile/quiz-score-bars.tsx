import Link from 'next/link';
import { copy, type QuizHistoryRow } from '@ayman/contracts';
import { cn } from '@ayman/ui';

const c = copy.profile;

/**
 * The student's best score in every quiz they have sat, as a bar per quiz.
 *
 * ## Why a bar chart and not the numbers alone
 *
 * The job is comparison — "which subjects am I weak in" — and a column of
 * percentages makes the reader do that comparison arithmetically, one pair at
 * a time. Bars make it pre-attentive: the short one is the answer.
 *
 * ## Why horizontal
 *
 * The category label is a full Arabic quiz title. Vertical bars would either
 * truncate every one of them or rotate them, and a rotated Arabic label is
 * unreadable in a way a rotated English one is not.
 *
 * ## The colour
 *
 * One hue, `--p-600`, the same validated mark colour `ScoreTrend` uses — see
 * its own note for why not `--a-9`. Nothing here is coloured by VALUE: a red
 * bar for a low score would be the platform's error red, which means "wrong
 * answer" in the quiz runner, and it would also make a chart that judges the
 * reader. The number is the judgement; the bar is the magnitude.
 *
 * `bestPercent` and not `latestPercent`, because that is the figure the
 * platform grades on (`gradeMethod: highest`) and the one the pass flag is
 * derived from. Showing the latest would let the chart and the verdict beside
 * it disagree.
 */
export function QuizScoreBars({ rows }: { rows: readonly QuizHistoryRow[] }) {
  // A quiz whose only attempt is still awaiting an essay grade has no percent
  // at all. Dropping the row is right: a bar of zero would read as a zero.
  const scored = rows.filter(
    (row): row is QuizHistoryRow & { bestPercent: number } => row.bestPercent !== null,
  );

  if (scored.length === 0) return null;

  return (
    <figure className="panel p-5">
      <figcaption className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="text-[length:var(--fs-title-4)] font-medium text-fg">{c.scoresTitle}</h3>
        <span className="mono shrink-0 text-[length:var(--fs-mono-label)] text-fg-muted">
          {c.scoresBest}
        </span>
      </figcaption>

      <ul className="flex flex-col gap-3">
        {scored.map((row) => (
          <li key={row.lessonId}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <Link
                href={`/quizzes/${row.lessonId}`}
                className="truncate text-[length:var(--fs-text-sm)] text-fg outline-offset-4 transition-colors duration-[160ms] ease-out hover:text-accent-text"
              >
                {row.quizTitle}
              </Link>
              {/* The value is direct-labelled on every row rather than
                  selectively: there are only ever a handful of quizzes, the
                  number IS what the student came to read, and a tooltip would
                  hide it behind a hover this page cannot offer on touch. */}
              <span className="mono tabular shrink-0 text-[length:var(--fs-mono-label)] text-fg">
                {row.bestPercent}%
              </span>
            </div>

            {/* The track is a full-width rail so every bar shares one baseline
                and lengths are comparable at a glance; without it each bar
                would be measured against nothing. */}
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-surface-4"
              role="img"
              aria-label={c.scoresBarLabel
                .replace('{quiz}', row.quizTitle)
                .replace('{percent}', String(row.bestPercent))}
            >
              <div
                className={cn('h-full rounded-full')}
                style={{ width: `${row.bestPercent}%`, background: 'var(--p-600)' }}
              />
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}
