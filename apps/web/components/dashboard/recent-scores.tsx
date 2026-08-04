import { copy, type RecentScore } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { ScoreStrip } from './score-strip';

/**
 * The scores card: five bars, then the five results they stand for.
 *
 * The empty state is not a stopgap — a brand-new student sees it until they
 * finish their first quiz, so it is designed rather than deferred.
 *
 * `ok` / `err` are legitimate here and nowhere else on this page: this IS quiz
 * correctness, the one thing green and red are reserved for. Progress bars and
 * percentages elsewhere on the dashboard stay amber for exactly that reason,
 * and `<ScoreStrip>` uses the same 50% pass line as the chips below so the two
 * halves of the card cannot disagree about the same attempt.
 */
export function RecentScores({ scores }: { scores: RecentScore[] }) {
  if (scores.length === 0) {
    return (
      // Violet-tinted, matching the courses empty state one column over: an
      // empty state is a container waiting to be filled, and a dashed grey
      // rectangle is indistinguishable from something that failed to load.
      <div className="rounded-lg border border-study-line bg-study-tint px-5 py-8 text-center">
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
          {copy.dashboard.noScoresYet}
        </p>
      </div>
    );
  }

  return (
    <>
      <ScoreStrip scores={scores} />
      <ul className="overflow-hidden rounded-lg border border-line bg-surface-2">
        {scores.map((score) => {
          const passed = score.scorePercent >= 50;
          return (
            <li
              key={score.attemptId}
              className="flex items-center justify-between gap-3 border-b border-line-subtle px-4 py-3 last:border-b-0"
            >
              <span className="min-w-0 flex-1 truncate text-start text-[length:var(--fs-text-sm)] text-fg">
                {score.quizTitle}
              </span>

              <span
                className={cn(
                  'mono tabular shrink-0 rounded-full border px-2 py-0.5',
                  'text-[length:var(--fs-mono-label)] font-medium',
                  passed
                    ? 'border-[color-mix(in_oklch,var(--ok),transparent_70%)] bg-[color-mix(in_oklch,var(--ok),transparent_92%)] text-[color:var(--ok)]'
                    : 'border-[color-mix(in_oklch,var(--err),transparent_70%)] bg-[color-mix(in_oklch,var(--err),transparent_92%)] text-[color:var(--err)]',
                )}
              >
                {Math.round(score.scorePercent)}%
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
