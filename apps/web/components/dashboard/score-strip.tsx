import { copy, type RecentScore } from '@ayman/contracts';
import { cn } from '@ayman/ui';

/**
 * The last five results as bars, above the list that names them.
 *
 * No chart library. `admin/quiz/score-histogram.tsx` settled this precedent
 * already: ten bars did not justify a dependency there and five do not here.
 * The real quiz analytics — per-quiz history, attempt comparison, accuracy
 * over time — are slice 2 and will make their own case for tooling.
 *
 * Reading order is the one non-obvious thing here. `recentScores` arrives
 * newest-first, and in an RTL document a `flex` row lays its first child out
 * at the RIGHT. That happens to be correct: the newest result sits where the
 * eye starts, and the strip reads backwards in time exactly like the text
 * around it. Do not "fix" this with `flex-row-reverse`.
 *
 * `aria-hidden` because the list underneath already states every one of these
 * numbers with the quiz it belongs to. A screen reader announcing five bare
 * percentages first would be the same data twice, without labels the first
 * time.
 */
export function ScoreStrip({ scores }: { scores: readonly RecentScore[] }) {
  if (scores.length === 0) return null;

  return (
    <div className="mb-3">
      <p className="eyebrow mb-2 text-fg-muted">{copy.dashboard.scoresTrend}</p>
      <div className="flex h-16 items-end gap-1.5" aria-hidden="true">
        {scores.map((score) => {
          const percent = Math.min(Math.max(score.scorePercent, 0), 100);
          // 50% is the pass line the list below already colours on. Bars use
          // the same threshold so the two halves of the card cannot tell
          // different stories about the same attempt.
          const passed = percent >= 50;

          return (
            <span
              key={score.attemptId}
              className="flex h-full flex-1 flex-col justify-end rounded-xs bg-surface-3"
            >
              {/*
                `max(4%, …)` so a genuine zero still draws a visible sliver.
                A bar of height 0 is indistinguishable from a missing attempt,
                and "I scored nothing" and "I did not sit it" are very
                different facts to leave a student guessing between.
              */}
              <span
                className={cn(
                  'block w-full rounded-xs',
                  passed
                    ? 'bg-[color-mix(in_oklch,var(--ok),transparent_35%)]'
                    : 'bg-[color-mix(in_oklch,var(--err),transparent_35%)]',
                )}
                style={{ height: `${Math.max(percent, 4)}%` }}
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}
