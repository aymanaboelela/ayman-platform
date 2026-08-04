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
 * The mark colour, and NOT `--a-9`.
 *
 * `--a-9` is the brand accent and it is the wrong tool for a data mark on a
 * light surface: measured against `--n-2` (#F9F8F6) it comes out at roughly
 * 2:1, which fails the 3:1 floor a chart mark has to clear. `--p-600` is the
 * same brand orange one step darker, and it passes all six palette checks in
 * BOTH themes against all three surfaces this chart can sit on (#F9F8F6,
 * #100F0E, #08090A) — verified with the palette validator rather than judged
 * by eye, which is the entire reason the validator exists.
 *
 * A literal rather than a token because it is deliberately the SAME value in
 * light and dark. Both modes clear the checks with it, and one mark colour
 * means the chart cannot drift between themes.
 */
const MARK = 'var(--p-600)';

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
          stroke={MARK}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {/*
          `r` in the viewBox's units would be stretched into an ellipse by
          `preserveAspectRatio="none"`. Drawing the markers as tiny circles
          with a non-scaling stroke sidesteps that: only the stroke, which does
          not scale, sets the visible size.

          Pass/fail is drawn as FILL, not as a second hue. Green-vs-orange is
          the obvious encoding and it measures ΔE 6.3 under protanopia against
          this mark colour — inside the validator's 6–8 floor band, which is
          legal only with a secondary encoding. Fill IS that encoding, and
          using it alone means the chart needs no second hue at all. `--ok`
          green is also spoken for on this platform: it means "correct answer"
          inside the quiz runner, two clicks from here.
        */}
        {points.map((p) => (
          <circle
            key={p.point.attemptId}
            cx={p.x}
            cy={p.y}
            r="0.6"
            fill={p.point.passed === false ? 'var(--n-2)' : MARK}
            stroke={MARK}
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {/* Two encodings on one plot means a legend is not optional. It is text
          in text tokens beside a shape, never a colour swatch on its own. */}
      <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
        {[
          { key: 'passed', label: copy.results.trendLegendPassed, filled: true },
          { key: 'failed', label: copy.results.trendLegendFailed, filled: false },
        ].map((entry) => (
          <li
            key={entry.key}
            className="flex items-center gap-2 text-[length:var(--fs-mono-label)] text-fg-muted"
          >
            <svg width="10" height="10" aria-hidden="true" className="shrink-0">
              <circle
                cx="5"
                cy="5"
                r="3.5"
                fill={entry.filled ? MARK : 'var(--n-2)'}
                stroke={MARK}
                strokeWidth="1.5"
              />
            </svg>
            {entry.label}
          </li>
        ))}
      </ul>

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
