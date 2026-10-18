import { MASTERY_STRONG_AT } from '@ayman/contracts/quiz/mastery';

/**
 * Which of the four result screens a paper gets — and the colour it is drawn
 * in. `/results`'s bands exactly (`lib/results-view.ts` `scoreBand`), with the
 * PAPER's own verdict deciding the line rather than the platform default: an
 * exam whose pass mark is 70 that scored 60 is under its line, whatever the
 * average screen would call 60.
 *
 *   pending — essays still with the instructor: no band, because no verdict.
 *   high    — «امتياز», 90 and up (`MASTERY_STRONG_AT`, the dashboard's line),
 *             and only on a paper that passed.
 *   pass    — over the paper's own pass line.
 *   low     — under it.
 *
 * The redesign this replaces banded on fixed 85/70 cut-offs that ignored the
 * pass mark, so a paper that PASSED at 60 got a red «لا مش هينفع كده» right
 * under its own «ناجح» badge. The verdict and the band now come from the same
 * fact and cannot contradict each other.
 */
export type ResultBand = 'pending' | 'high' | 'pass' | 'low';

export const EXCELLENT_PERCENT = MASTERY_STRONG_AT;

export function resultBand({
  percent,
  passed,
  passPercent,
  outstanding,
}: {
  /** 0–100 over the total the headline is drawn against; null with no score. */
  percent: number | null;
  passed: boolean | null;
  passPercent: number;
  /** Marks still with the instructor. */
  outstanding: boolean;
}): ResultBand {
  if (outstanding) return 'pending';
  const over = passed ?? (percent !== null && percent >= passPercent);
  if (!over) return 'low';
  return percent !== null && percent >= EXCELLENT_PERCENT ? 'high' : 'pass';
}
