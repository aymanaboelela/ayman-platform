import type { AttemptQuestionState } from '../../../generated/prisma/enums';
import { roundMark } from './fraction';

/**
 * How a paper's total splits between «اتصحّح» and «لسه عند المهندس».
 *
 * ## The number a student is shown must be out of what was actually marked
 *
 * `gradeAttempt` counts an ungraded essay as ZERO — deliberately, and
 * correctly, because a provisional total has to come from somewhere and a
 * pending answer can only ever raise it. But `scaledScore` is then rendered
 * against `gradeOutOf`, and on a 100-mark midterm whose 50 marks of essay are
 * still on the instructor's desk that reads «٤٨٫٥ من ١٠٠» — a near-fail, to a
 * student who in fact got 48.5 out of the 50 that have been looked at.
 *
 * «هيتخض» is the word for it, and the fix is not a softer sentence next to the
 * same number: it is a different denominator. The marked part is reported out
 * of what the marked part is worth, and the rest is named as an amount that is
 * still coming rather than left to be inferred from a gap.
 *
 * ## Why it is derived and not stored
 *
 * It moves as the instructor marks. One essay of two marked halves the pending
 * figure, and `recomputeScoreTx` already rewrites the score on every such
 * write — a second persisted column would be one more thing to keep in step
 * with it, for a value that is a sum over rows already in hand at every call
 * site that needs it.
 *
 * ## Scale
 *
 * `maxMark` is on the PAPER's scale (summing to the attempt's own `sumMarks`
 * snapshot), while a student is shown marks out of `gradeOutOf` — the two
 * differ on 150 of 154 quizzes. So the pending share is scaled the same way
 * `gradeAttempt` scales `rawScore`, and `gradedOutOf` is then the REMAINDER
 * rather than a second independent rounding: two halves that each rounded up
 * would add to 100.5, and a screen that says «٥٠٫٥ من ٥٠٫٥ + ٥٠» about a
 * hundred-mark exam is worse than the problem this solves.
 */
export interface MarkSplit {
  /** What the already-marked part of the paper is worth, out of `gradeOutOf`. */
  gradedOutOf: number;
  /** What is still with the instructor, out of `gradeOutOf`. `0` when nothing
   *  is — which is the only signal any caller needs to render the ordinary,
   *  undivided result. */
  pendingOutOf: number;
}

/** The one state that means "a human has not looked at this yet". Deliberately
 *  NOT `!== graded_*`: `todo`/`complete` cannot survive `gradeAndFinalise`
 *  (every question is graded at submit), and treating a state that cannot
 *  occur as pending would quietly subtract marks from the denominator of a
 *  fully auto-marked paper. */
const PENDING: AttemptQuestionState = 'needs_grading';

export function splitMarks(
  questions: readonly { state: AttemptQuestionState; maxMark: number }[],
  attempt: { sumMarks: number; gradeOutOf: number },
): MarkSplit {
  return splitPendingMarks(
    questions.reduce(
      (sum, question) => (question.state === PENDING ? sum + question.maxMark : sum),
      0,
    ),
    attempt,
  );
}

/**
 * The same split from a pre-summed total, for the caller that has already
 * aggregated it in SQL rather than loading every question row
 * (`QuizAccessService.getLessonOverview` groups by attempt).
 *
 * `pendingMarks` is on the paper's scale — the sum of `attempt_questions.
 * maxMark` over the rows still in `needs_grading` — exactly what `splitMarks`
 * computes in memory.
 */
export function splitPendingMarks(
  pendingMarks: number,
  attempt: { sumMarks: number; gradeOutOf: number },
): MarkSplit {
  const gradeOutOf = roundMark(attempt.gradeOutOf);

  // Same guard `gradeAttempt` holds for the same division: a quiz whose slots
  // all failed to resolve has `sumMarks` 0, and scaling by it is Infinity.
  if (attempt.sumMarks <= 0 || pendingMarks <= 0) {
    return { gradedOutOf: gradeOutOf, pendingOutOf: 0 };
  }

  const pendingOutOf = Math.min(
    gradeOutOf,
    roundMark((pendingMarks / attempt.sumMarks) * gradeOutOf),
  );
  return { gradedOutOf: roundMark(gradeOutOf - pendingOutOf), pendingOutOf };
}
