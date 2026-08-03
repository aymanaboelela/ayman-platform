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
 * ## The y axis
 *
 * Fixed to 0–100 rather than scaled to the data's own range. An auto-scaled
 * axis makes 62% and 64% look like a dramatic climb, which on a page about a
 * student's exam results is not a neutral rendering choice.
 */
export function projectSeries(series: readonly QuizHistoryPoint[]): ChartPoint[] {
  if (series.length === 0) return [];

  if (series.length === 1) {
    const only = series[0]!;
    return [{ x: CHART_WIDTH / 2, y: yFor(only.scorePercent), point: only }];
  }

  const step = CHART_WIDTH / (series.length - 1);

  return series.map((point, index) => ({
    // Clamped, not merely computed. `CHART_WIDTH - index * step` accumulates
    // floating-point error across the series: with 40 points the last one
    // lands at -1.42e-14 rather than 0, i.e. a hair outside the viewBox. It
    // is invisible in a render and it makes the "every point is inside the
    // box" invariant false, which is the kind of almost-right that survives
    // until something downstream depends on it.
    x: clamp(CHART_WIDTH - index * step, 0, CHART_WIDTH),
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
