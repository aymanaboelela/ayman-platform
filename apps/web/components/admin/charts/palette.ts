/**
 * The chart palette, as the components consume it.
 *
 * The VALUES live in `packages/ui/src/tokens/viz.css` — that file documents
 * how they were derived and what they measure. This module only names the
 * slots and enforces the two rules a component can otherwise break by
 * accident.
 */

/** Categorical identity. Assigned in order, never cycled. */
export const SERIES = [
  'var(--viz-1)',
  'var(--viz-2)',
  'var(--viz-3)',
  'var(--viz-4)',
  'var(--viz-5)',
  'var(--viz-6)',
] as const;

export const SERIES_MAX = SERIES.length;

/**
 * Slot N, by INDEX — and it throws past the last slot rather than wrapping.
 *
 * Cycling is the specific failure this guards: a seventh series that silently
 * reuses slot 1 makes two different things the same colour, which is worse
 * than an error because the chart still renders and still looks fine. Past six
 * categories, fold the tail into «غير ذلك» or facet — never generate a hue.
 */
export function seriesColor(index: number): string {
  const color = SERIES[index];
  if (color === undefined) {
    throw new RangeError(
      `chart palette has ${SERIES_MAX} categorical slots; asked for #${index + 1}. ` +
        'Fold the tail into an "other" bucket or use small multiples.',
    );
  }
  return color;
}

/** Magnitude. Step 1 is nearest the surface and means "near zero"; it is
 *  allowed to recede, which is why this ramp is for CONTINUOUS fields
 *  (heatmap cells) and `ordinalColor` is for discrete marks. */
const SEQUENTIAL = [
  'var(--viz-seq-100)',
  'var(--viz-seq-200)',
  'var(--viz-seq-300)',
  'var(--viz-seq-400)',
  'var(--viz-seq-500)',
  'var(--viz-seq-600)',
  'var(--viz-seq-700)',
] as const;

/** `fraction` 0..1 → the step that carries that magnitude. */
export function sequentialColor(fraction: number): string {
  const clamped = Math.min(1, Math.max(0, fraction));
  const step = Math.min(SEQUENTIAL.length - 1, Math.round(clamped * (SEQUENTIAL.length - 1)));
  return SEQUENTIAL[step]!;
}

/** Five ordered buckets, every step ≥ 2:1 on the surface. Index 0 is the low
 *  end of the order. Wraps by clamping, not by cycling — an ordinal ramp that
 *  wrapped would put the top bucket back at the bottom's colour. */
const ORDINAL = [
  'var(--viz-ord-1)',
  'var(--viz-ord-2)',
  'var(--viz-ord-3)',
  'var(--viz-ord-4)',
  'var(--viz-ord-5)',
] as const;

export function ordinalColor(index: number, count: number = ORDINAL.length): string {
  if (count <= 1) return ORDINAL[ORDINAL.length - 1]!;
  const position = Math.min(1, Math.max(0, index / (count - 1)));
  return ORDINAL[Math.round(position * (ORDINAL.length - 1))]!;
}

/** Everything that is not the point. An emphasis chart is one series in a hue
 *  and the rest in this — the most underused honest chart form there is. */
export const MUTED = 'var(--viz-muted)';
export const TRACK = 'var(--viz-track)';
export const GRID = 'var(--viz-grid)';
export const AXIS = 'var(--viz-axis)';
