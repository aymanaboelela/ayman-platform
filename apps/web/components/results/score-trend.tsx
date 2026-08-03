import { copy, formatCopy, type QuizHistoryPoint } from '@ayman/contracts';
import {
  CHART_HEIGHT,
  CHART_WIDTH,
  passLineY,
  polylinePoints,
  projectSeries,
} from '@/lib/quiz-history-view';

/** The pass line the chart draws. Quizzes carry their own `passPercent`, but
 *  this chart spans every quiz at once, so it shows the platform default
 *  rather than pretending one threshold applies to all of them. The per-quiz
 *  rows underneath state each quiz's real verdict. */
const PASS_LINE_PERCENT = 50;

/**
 * Every submitted attempt as one line.
 *
 * No chart library. `admin/quiz/score-histogram.tsx` (ten bars) and the
 * dashboard's `score-strip.tsx` (five bars) already settled this: a polyline
 * over N points is a `viewBox`, a `points` string and two `<line>`s, against
 * 40kB+ of JavaScript for a page that renders one chart. The geometry lives in
 * `lib/quiz-history-view.ts` so it is unit-tested rather than eyeballed.
 *
 * ## Accessibility
 *
 * The `<svg>` is `aria-hidden` and a sentence beside it carries the same fact
 * in text. A polyline announces nothing useful, and reading out N bare
 * percentages would be the per-quiz list below without any of its labels.
 *
 * `preserveAspectRatio="none"` is correct here and unusual: the chart is a
 * data plot that should fill whatever width it is given, not a glyph whose
 * proportions carry meaning. The stroke is drawn in a `vector-effect` that
 * keeps it 1.5px regardless of the resulting scale distortion.
 */
export function ScoreTrend({ series }: { series: readonly QuizHistoryPoint[] }) {
  const points = projectSeries(series);
  if (points.length === 0) return null;

  const first = series[0]!;
  const last = series[series.length - 1]!;
  const passY = passLineY(PASS_LINE_PERCENT);

  return (
    <figure className="rounded-lg border border-line bg-surface-2 p-5">
      <figcaption className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-[length:var(--fs-title-4)] font-medium text-fg">
          {copy.results.trendTitle}
        </h2>
        <span className="mono shrink-0 text-[length:var(--fs-mono-label)] text-fg-muted">
          {copy.results.trendPassLine} {PASS_LINE_PERCENT}%
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        role="presentation"
        aria-hidden="true"
        className="h-40 w-full"
      >
        <line
          x1="0"
          x2={CHART_WIDTH}
          y1={passY}
          y2={passY}
          stroke="var(--border-strong)"
          strokeWidth="1"
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />

        <polyline
          points={polylinePoints(points)}
          fill="none"
          stroke="var(--a-9)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {/*
          `r` in the viewBox's units would be stretched into an ellipse by
          `preserveAspectRatio="none"`. Drawing the markers as tiny circles
          with a non-scaling stroke and no fill sidesteps that: only the
          stroke, which does not scale, is visible at this size.
        */}
        {points.map((p) => (
          <circle
            key={p.point.attemptId}
            cx={p.x}
            cy={p.y}
            r="0.6"
            fill="none"
            stroke="var(--a-9)"
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      <p className="mt-3 text-[length:var(--fs-text-sm)] text-fg-muted">
        {formatCopy(copy.results.trendSummary, {
          count: series.length,
          first: first.scorePercent,
          last: last.scorePercent,
        })}
      </p>
    </figure>
  );
}
