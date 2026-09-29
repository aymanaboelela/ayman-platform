import type { QuizHistoryPoint } from '@ayman/contracts';

/**
 * Geometry for the score-trend chart, kept out of the component so it can be
 * tested without a render. Everything here is pure arithmetic over the series
 * the API already returned; nothing fetches, and nothing reads the DOM.
 */

/** The chart's coordinate space. Not pixels — the `<svg>` scales via viewBox. */
export const CHART_WIDTH = 100;
export const CHART_HEIGHT = 40;

export interface ChartPoint {
  x: number;
  y: number;
  point: QuizHistoryPoint;
}

/**
 * Projects the series onto the chart box.
 *
 * ## Direction
 *
 * `x` runs from `CHART_WIDTH` down to 0 as time advances: the OLDEST attempt
 * is drawn at the right edge and the newest at the left. The document is RTL,
 * so this is time advancing in the same direction the surrounding text is
 * read. It is deliberate, not a mirrored bug — `score-strip.tsx` records the
 * same reasoning for the dashboard's five-bar strip.
 *
 * ## The one-point case
 *
 * With a single attempt there is no interval to divide by, and `width / 0` is
 * `Infinity` — which serialises into the `points` attribute as garbage and
 * renders nothing at all. A lone point is placed at the middle of the box
 * instead, which is also what it means: one reading, no trend.
 *
 * ## `inset`
 *
 * How far in from each side the first and last points sit, in the same units
 * as `CHART_WIDTH`. `/results` labels every point with its score and its date
 * CENTRED on the point, so a point on the very edge of the box has half its
 * label hanging outside the card; an inset of a few units keeps both ends'
 * labels inside without a second coordinate system for the text.
 *
 * ## The y axis
 *
 * Fixed to 0–100 rather than scaled to the data's own range. An auto-scaled
 * axis makes 62% and 64% look like a dramatic climb, which on a page about a
 * student's exam results is not a neutral rendering choice.
 */
export function projectSeries(series: readonly QuizHistoryPoint[], inset = 0): ChartPoint[] {
  if (series.length === 0) return [];

  if (series.length === 1) {
    const only = series[0]!;
    return [{ x: CHART_WIDTH / 2, y: yFor(only.scorePercent), point: only }];
  }

  const span = CHART_WIDTH - inset * 2;
  const step = span / (series.length - 1);

  return series.map((point, index) => ({
    // Clamped, not merely computed. `CHART_WIDTH - index * step` accumulates
    // floating-point error across the series: with 40 points the last one
    // lands at -1.42e-14 rather than 0, i.e. a hair outside the viewBox. It
    // is invisible in a render and it makes the "every point is inside the
    // box" invariant false, which is the kind of almost-right that survives
    // until something downstream depends on it.
    x: clamp(CHART_WIDTH - inset - index * step, inset, CHART_WIDTH - inset),
    y: yFor(point.scorePercent),
    point,
  }));
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** SVG's y grows downward, so a high score sits near 0. */
function yFor(percent: number): number {
  const clamped = Math.min(Math.max(percent, 0), 100);
  return CHART_HEIGHT - (clamped / 100) * CHART_HEIGHT;
}

/** `y` for a horizontal rule at a given percentage — the pass line. */
export function passLineY(passPercent: number): number {
  return yFor(passPercent);
}

/** The `points` attribute of a `<polyline>`. */
export function polylinePoints(points: readonly ChartPoint[]): string {
  return points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ');
}

/**
 * Two decimals. The default `toString` on these divisions produces 17
 * significant figures, which multiplies the size of the `points` attribute for
 * precision no rasteriser can use.
 */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The `points` of a `<polygon>` that fills UNDER the line, down to the
 * floor — the area wash. The line's own points, then the two floor corners
 * beneath its ends, so the shape closes along the x axis rather than cutting a
 * diagonal back to the first point.
 *
 * Empty for fewer than two points: one point has no area under it, and a
 * degenerate polygon is an invisible element a screen reader may still find.
 */
export function areaPoints(points: readonly ChartPoint[]): string {
  if (points.length < 2) return '';
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return `${polylinePoints(points)} ${round(last.x)},${CHART_HEIGHT} ${round(first.x)},${CHART_HEIGHT}`;
}
