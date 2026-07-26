/**
 * Kelley's 27% method: D = p(top 27% by total score) − p(bottom 27%).
 * Chosen over a point-biserial correlation because it is explainable to a
 * teacher in one sentence, and because it degrades gracefully on the attempt
 * counts a single-instructor platform actually sees.
 */
export interface DiscriminationRow {
  /** The student's TOTAL attempt score — what ranks them into top/bottom. */
  total: number;
  /** This item's own 0..1 fraction for that student — partial credit, not a boolean. */
  fraction: number;
}

export interface DiscriminationOptions {
  /** Default 0.27 — Kelley's own constant. */
  groupPercent?: number;
  /** Fewer attempts than this and the result is `null`, never a confident
   *  lie built on a handful of rows. Default 10. */
  minSampleSize?: number;
}

const DEFAULT_GROUP_PERCENT = 0.27;
const DEFAULT_MIN_SAMPLE_SIZE = 10;

export function kelleyDiscrimination(
  rows: readonly DiscriminationRow[],
  options: DiscriminationOptions = {},
): number | null {
  const minSampleSize = options.minSampleSize ?? DEFAULT_MIN_SAMPLE_SIZE;
  if (rows.length < minSampleSize) return null;

  const groupPercent = options.groupPercent ?? DEFAULT_GROUP_PERCENT;
  // At least one attempt per group even when N*27% rounds to zero — a
  // discrimination index computed over an EMPTY group is not a number, it's
  // a division by zero waiting to happen.
  const groupSize = Math.max(1, Math.round(rows.length * groupPercent));

  // Array.prototype.sort is stable since ES2019 — a tie-heavy input (every
  // total identical) still produces a deterministic, non-crashing split.
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  const top = sorted.slice(0, groupSize);
  const bottom = sorted.slice(sorted.length - groupSize);

  const average = (group: readonly DiscriminationRow[]): number =>
    group.reduce((sum, row) => sum + row.fraction, 0) / group.length;

  return average(top) - average(bottom);
}
