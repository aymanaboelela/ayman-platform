import { TrendingUp } from 'lucide-react';
import { copy, formatCopy, type QuizHistoryPoint } from '@ayman/contracts';
import {
  CHART_HEIGHT,
  CHART_WIDTH,
  areaPoints,
  passLineY,
  polylinePoints,
  projectSeries,
  type ChartPoint,
} from '@/lib/quiz-history-view';
import { PASS_LINE_PERCENT, formatDay } from '@/lib/results-view';
import { IsolatedFigures } from './isolated-figures';

const c = copy.results;

/** How far in the two end points sit, so their centred labels stay on the card. */
const INSET = 7;

/** Every point gets its score up to this many; past it, only the ones worth reading. */
const LABEL_ALL_UP_TO = 8;
/** Every point gets its date up to this many; past it, the two ends. */
const DATE_ALL_UP_TO = 4;

type PointState = 'passed' | 'failed' | 'pending';

function stateOf(point: QuizHistoryPoint): PointState {
  if (point.passed === null) return 'pending';
  return point.passed ? 'passed' : 'failed';
}

/**
 * Every submitted attempt as one line — readable on a phone at one point or
 * forty.
 *
 * ## What changed, and why
 *
 * The first version was a 1.5px polyline with 3px dots, no axis, no dates and
 * no numbers; on a phone with three attempts it was a thin stroke in a large
 * empty box, and the only way to know what a dot scored was to find the same
 * quiz in the list below. Now:
 *
 * - every point carries its score (up to `LABEL_ALL_UP_TO`, then the first,
 *   the last, the best and the lowest — the four worth reading);
 * - the x axis has dates, and the y axis has 0 / 50 / 100;
 * - the line sits on an area wash, so its shape reads at a glance;
 * - ONE attempt renders as a single labelled point with a sentence under it,
 *   rather than the chart disappearing — a student who has sat one exam is
 *   the one most worth showing where the line will start.
 *
 * ## Two layers, on purpose
 *
 * The wash, the line and the rules are an `<svg>` stretched to the box with
 * `preserveAspectRatio="none"` — a data plot that fills whatever width it is
 * given. Everything that must NOT stretch — the dots, which would become
 * ellipses, and every label, which would become unreadable — is HTML placed
 * over it at the same percentages. One set of coordinates
 * (`projectSeries`), two renderers, and nothing distorted.
 *
 * ## Direction
 *
 * Oldest at the RIGHT, newest at the left: time advances in the direction the
 * page is read, the same decision `AreaChart` and `score-strip.tsx` record.
 * The HTML layer places points with `inset-inline-start`, which in this RTL
 * document is measured from the right — the same edge `projectSeries` counts
 * from.
 *
 * ## Colour
 *
 * The line is `--viz-1`, the chart palette's first slot, validated ≥ 3:1 on
 * both themes' cards. Pass/fail is drawn as FILL (filled / hollow), never as a
 * second hue: green-vs-amber is ΔE 6.3 under protanopia, and green is spoken
 * for on this platform — it means "correct answer" inside the quiz runner. The
 * legend states both, in text.
 *
 * ## Accessibility
 *
 * The drawing is `aria-hidden`. What it says is carried twice in text: the
 * caption sentence («رسم بياني لـ٣ محاولة، من ٢٧٪ لحد ١٪») and a visually
 * hidden list with one line per attempt — its exam, score, verdict and date.
 */
export function ScoreTrend({ series }: { series: readonly QuizHistoryPoint[] }) {
  const points = projectSeries(series, INSET);
  if (points.length === 0) return null;

  const first = series[0]!;
  const last = series[series.length - 1]!;
  const single = points.length === 1;
  const scoreLabels = labelledIndexes(points);
  const dateLabels = datedIndexes(points.length);
  const states = new Set(series.map(stateOf));
  const passY = passLineY(PASS_LINE_PERCENT);

  return (
    <figure className="rs-card rs-trend">
      <div className="rs-card__head">
        <span className="rs-card__icon" aria-hidden="true">
          <TrendingUp className="size-4" />
        </span>
        <h2 className="rs-card__title">{c.trendTitle}</h2>
      </div>

      <div className="rs-trend__plot" aria-hidden="true">
        <div className="rs-trend__axis">
          {[100, PASS_LINE_PERCENT, 0].map((tick) => (
            <span
              key={tick}
              className="rs-trend__tick"
              data-pass={tick === PASS_LINE_PERCENT ? '' : undefined}
              style={{ top: `${(passLineY(tick) / CHART_HEIGHT) * 100}%` }}
            >
              <span className="rs-ltr">{tick}%</span>
            </span>
          ))}
        </div>

        <div className="rs-trend__box">
          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            preserveAspectRatio="none"
            className="rs-trend__svg"
            focusable="false"
          >
            <defs>
              <linearGradient id="rs-trend-wash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style={{ stopColor: 'var(--viz-1)', stopOpacity: 0.3 }} />
                <stop offset="1" style={{ stopColor: 'var(--viz-1)', stopOpacity: 0 }} />
              </linearGradient>
            </defs>

            {[0, CHART_HEIGHT].map((y) => (
              <line key={y} x1="0" x2={CHART_WIDTH} y1={y} y2={y} className="rs-trend__grid" />
            ))}
            <line x1="0" x2={CHART_WIDTH} y1={passY} y2={passY} className="rs-trend__pass" />

            {single ? null : (
              <>
                <polygon points={areaPoints(points)} fill="url(#rs-trend-wash)" />
                <polyline points={polylinePoints(points)} className="rs-trend__line" />
              </>
            )}
          </svg>

          {points.map((p, index) => (
            <Dot
              key={p.point.attemptId}
              p={p}
              state={stateOf(p.point)}
              label={scoreLabels.has(index)}
              latest={index === points.length - 1}
            />
          ))}
        </div>

        <div className="rs-trend__dates">
          {points.map((p, index) =>
            dateLabels.has(index) ? (
              <span
                key={p.point.attemptId}
                className="rs-trend__date"
                style={{ insetInlineStart: `${inlineStart(p)}%` }}
              >
                {formatDay(p.point.submittedAt)}
              </span>
            ) : null,
          )}
        </div>
      </div>

      {single ? <p className="rs-trend__single">{c.trendSingle}</p> : null}

      {/* A legend is not optional with two encodings on one plot: text beside
          a shape, never a colour swatch on its own. Only the states that are
          actually drawn — a «لسه بتتصحّح» entry with no such point on the
          chart is a key to nothing. */}
      <ul className="rs-legend">
        <li>
          <span className="rs-legend__rule" aria-hidden="true" />
          <IsolatedFigures text={`${c.trendPassLine} ${PASS_LINE_PERCENT}%`} />
        </li>
        {states.has('passed') ? (
          <li>
            <span className="rs-legend__dot" data-state="passed" aria-hidden="true" />
            {c.trendLegendPassed}
          </li>
        ) : null}
        {states.has('failed') ? (
          <li>
            <span className="rs-legend__dot" data-state="failed" aria-hidden="true" />
            {c.trendLegendFailed}
          </li>
        ) : null}
        {states.has('pending') ? (
          <li>
            <span className="rs-legend__dot" data-state="pending" aria-hidden="true" />
            {c.trendLegendPending}
          </li>
        ) : null}
      </ul>

      <ol className="sr-only">
        {series.map((point) => (
          <li key={point.attemptId}>
            {formatCopy(c.trendPoint, {
              title: point.quizTitle,
              score: point.scorePercent,
              verdict: VERDICT_WORD[stateOf(point)],
              date: formatDay(point.submittedAt),
            })}
          </li>
        ))}
      </ol>

      <figcaption className="rs-trend__caption">
        <IsolatedFigures
          text={
            single
              ? formatCopy(c.trendSummaryOne, { score: first.scorePercent })
              : formatCopy(c.trendSummary, {
                  count: series.length,
                  first: first.scorePercent,
                  last: last.scorePercent,
                })
          }
        />
      </figcaption>
    </figure>
  );
}

const VERDICT_WORD: Record<PointState, string> = {
  passed: c.trendLegendPassed,
  failed: c.trendLegendFailed,
  pending: c.trendLegendPending,
};

function Dot({
  p,
  state,
  label,
  latest,
}: {
  p: ChartPoint;
  state: PointState;
  label: boolean;
  latest: boolean;
}) {
  return (
    <span
      className="rs-dot"
      data-state={state}
      data-latest={latest ? '' : undefined}
      style={{ insetInlineStart: `${inlineStart(p)}%`, top: `${(p.y / CHART_HEIGHT) * 100}%` }}
    >
      {label ? (
        <span className="rs-dot__label">
          <span className="rs-ltr">{p.point.scorePercent}%</span>
        </span>
      ) : null}
    </span>
  );
}

/** `projectSeries` counts x from the LEFT edge; the HTML layer counts from inline-start (the right). */
function inlineStart(p: ChartPoint): number {
  return ((CHART_WIDTH - p.x) / CHART_WIDTH) * 100;
}

/**
 * Which points get their score printed. All of them while there is room; past
 * `LABEL_ALL_UP_TO` only the first, the last, the highest and the lowest —
 * the start, where it stands now, and the two extremes. Labels on every one
 * of forty points is a grey smear, not information.
 */
export function labelledIndexes(points: readonly ChartPoint[]): Set<number> {
  if (points.length <= LABEL_ALL_UP_TO) return new Set(points.map((_, index) => index));

  let high = 0;
  let low = 0;
  points.forEach((p, index) => {
    if (p.point.scorePercent > points[high]!.point.scorePercent) high = index;
    if (p.point.scorePercent < points[low]!.point.scorePercent) low = index;
  });
  return new Set([0, points.length - 1, high, low]);
}

/** Which points get a date under them — all while they fit, then the two ends. */
export function datedIndexes(count: number): Set<number> {
  if (count <= DATE_ALL_UP_TO) return new Set(Array.from({ length: count }, (_, index) => index));
  return new Set([0, count - 1]);
}
