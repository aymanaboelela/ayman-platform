/**
 * The numbers «محاولات الطلاب» prints, shaped once. No words here — every
 * string the screen shows is in `copy.quizAdmin.board`, and a mark goes through
 * `formatMark` from `@ayman/contracts/format` like everywhere else.
 */

/**
 * A percentage as a whole number that rounding never pushes across 0 or 100.
 *
 * «١٠٠٪ نجحوا» about a quiz where one student in three hundred failed is a
 * claim, not a rounding — and «٠٪» about a quiz someone passed is the same lie
 * the other way. The analytics surface holds the same line (`pct` in
 * `components/admin/charts/format.ts`); this is its whole-number twin.
 */
export function wholePercent(value: number): number {
  if (value > 0 && value < 1) return 1;
  if (value > 99 && value < 100) return 99;
  return Math.round(value);
}

/**
 * How long a sitting took, start to hand-in, or `null` when it has not been
 * handed in. A hand-in stamped before its own start (a clock skew, a hand
 * edit) is also `null` rather than a negative duration.
 */
export function sittingSeconds(startedAt: string, submittedAt: string | null): number | null {
  if (!submittedAt) return null;
  const seconds = (Date.parse(submittedAt) - Date.parse(startedAt)) / 1000;
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}
