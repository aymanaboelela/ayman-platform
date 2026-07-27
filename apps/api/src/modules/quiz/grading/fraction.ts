import type { AttemptQuestionState } from '../../../generated/prisma/enums';

/**
 * Moodle's question_state::graded_state_for_fraction(), constants included.
 * DO NOT "clean these up" into `=== 0` / `=== 1`. A ten-option multi-choice
 * question whose weights are 0.1 each sums to 0.9999999999999999, and an exact
 * comparison would tell a student who answered perfectly that they were only
 * partially correct.
 */
export const WRONG_THRESHOLD = 0.000001;
export const RIGHT_THRESHOLD = 0.999999;

export type GradedState = Extract<
  AttemptQuestionState,
  'graded_wrong' | 'graded_partial' | 'graded_right'
>;

export function fractionToState(fraction: number): GradedState {
  // NaN fails every comparison, so it would otherwise fall through to
  // "partial". Fail closed: an ungradeable value is not a partial credit.
  if (!Number.isFinite(fraction)) return 'graded_wrong';
  if (fraction < WRONG_THRESHOLD) return 'graded_wrong';
  // B8: `>=`, not `>`. `numeric(10,6)` rounds each option weight
  // independently, so a naive `1/3` split (0.333333 stored three times) sums
  // to EXACTLY 0.999999 — landing precisely ON this threshold, not above it.
  // With the strict `>`, a student who ticks every correct option on such a
  // question was graded "partial" on a perfect answer. `quantizeWeights`
  // (question-bank.service.ts) now makes stored weights sum to exactly
  // 1.000000 at write time, but this comparison is fixed independently as a
  // second, belt-and-braces layer: summing already-quantized Decimal values
  // back through IEEE-754 doubles can still land a hair below 1 (e.g. a
  // 7-way split), and this threshold is the boundary that decides "right" vs
  // "partial" either way.
  if (fraction >= RIGHT_THRESHOLD) return 'graded_right';
  return 'graded_partial';
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Marks are stored as numeric(10,4); rounding to five places before persisting
 * keeps the in-memory value and the stored value identical, so a re-read never
 * changes a displayed grade. `+ 0` collapses -0 to 0 — a mark rendered as "-0"
 * on a results screen is a support ticket.
 */
export function roundMark(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number((Math.round(value * 1e5) / 1e5).toFixed(5)) + 0;
}
