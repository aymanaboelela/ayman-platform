/**
 * What a CHOICE answer earns — the one formula, read by the API's grader
 * (`gradeQuestion`) and by the marking screen's suggested mark, so the number
 * the screen suggests is the engine's number and not a second opinion.
 *
 * Moodle's, as ported in the API:
 *
 *   · a single answer (`mcq_single`, `true_false`) earns its option's weight
 *     VERBATIM — it may be negative; the per-slot floor is applied later, by
 *     the caller, from the snapshotted `min_fraction`;
 *   · several answers (`mcq_multi`) earn the sum of the ticked weights,
 *     clamped to [0, 1] — the clamp at 0 is the whole reason ticking every
 *     distractor cannot take a question below nothing.
 *
 * A weight is the option's `fraction`, in [-1, 1]. A question can carry more
 * than one positive weight on a single answer («أدق إجابة» 1, «قريبة» 0.5) —
 * which is exactly what a suggestion built on «picked the right option or not»
 * got wrong.
 *
 * `null` is an answer the question cannot take — two picks on a single
 * answer, an id that is not one of its options — which the grader marks wrong.
 */

export type ChoiceType = 'mcq_single' | 'true_false' | 'mcq_multi';

export interface WeightedOption {
  id: string;
  fraction: number;
}

export interface ChoiceGrade {
  fraction: number;
  /** The options the answer matched, in the question's own order. */
  matched: string[];
}

export function gradeChoice(
  type: ChoiceType,
  options: readonly WeightedOption[],
  optionIds: readonly string[],
): ChoiceGrade | null {
  if (type === 'mcq_multi') {
    const ticked = options.filter((option) => optionIds.includes(option.id));
    const sum = ticked.reduce((total, option) => total + option.fraction, 0);
    return { fraction: clampUnit(sum), matched: ticked.map((option) => option.id) };
  }
  if (optionIds.length !== 1) return null;
  const chosen = options.find((option) => option.id === optionIds[0]);
  return chosen ? { fraction: chosen.fraction, matched: [chosen.id] } : null;
}

/** [0, 1], and a non-finite sum is nothing — the API's `clamp` does the same. */
function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}
