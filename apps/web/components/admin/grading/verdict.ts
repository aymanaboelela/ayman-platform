/** What the marking screen calls a row's stored state. */
export type Verdict = 'correct' | 'incorrect' | 'partial' | 'needs_grading';

/**
 * The row's stored state, as the verdict the chip shows.
 *
 * ⚠️ `correctness` on the wire is the RAW `attempt_questions.state` —
 * `graded_right` / `graded_wrong` / `graded_partial` / `needs_grading` — and
 * the redesign compared it against `'correct'` / `'incorrect'`, which never
 * match: every engine-marked question was labelled «محتاجة تصحيح يدوي» and
 * the paper's «الإجابات الغلط» / «الصح» filters were always empty.
 */
export function verdictFromState(state: string | undefined): Verdict {
  switch (state) {
    case 'graded_right':
      return 'correct';
    case 'graded_wrong':
      return 'incorrect';
    case 'graded_partial':
      return 'partial';
    default:
      return 'needs_grading';
  }
}

/**
 * The marking screen's filter buckets, from the same mapping — so a chip that
 * says «إجابة غلط» and a filter called «الإجابات الغلط» can never disagree.
 */
export function isWrongVerdict(verdict: Verdict): boolean {
  return verdict === 'incorrect' || verdict === 'partial';
}
