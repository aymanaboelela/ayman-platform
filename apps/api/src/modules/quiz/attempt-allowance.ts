import { attemptAllowance } from '@ayman/contracts/quiz/quiz-settings';
import type { QuizPaper } from '@ayman/contracts/quiz/quiz-settings';

/** The subset of an attempt row the allowance rule reads. */
export interface AllowanceAttempt {
  attemptNo: number;
  paper: QuizPaper;
  state: 'in_progress' | 'overdue' | 'submitted' | 'pending_review' | 'abandoned';
  extraAttempts: number;
  scaledScore: number | null;
}

export type NextSitting =
  | { allowed: true; paper: QuizPaper }
  | { allowed: false; reason: 'no_attempts_left' };

/** A sitting that reached the end — the two states that produce a grade. */
const FINISHED = new Set(['submitted', 'pending_review']);

function hasFinished(attempts: readonly AllowanceAttempt[], paper: QuizPaper): boolean {
  return attempts.some((attempt) => attempt.paper === paper && FINISHED.has(attempt.state));
}

/**
 * Whether this student may start another sitting of this quiz, and on which
 * paper. The ONLY place either question is answered.
 *
 * ## Every attempt row consumes the allowance, whatever its state
 *
 * Including `abandoned`. This looks harsh and is deliberate: `abandoned` is
 * what `overdueHandling: 'autoabandon'` produces when the clock runs out, so
 * treating it as "didn't count" would mean a student who dislikes their paper
 * can walk away from it and be handed a fresh one. That is a retake with extra
 * steps, and retakes are the thing this module exists to remove.
 *
 * The escape hatch for a genuine technical failure is `extraAttempts` — an
 * admin grant, written through the audit log, that widens the allowance below.
 * A student cannot ask for one and no UI offers it.
 *
 * ## Which paper
 *
 * The improvement paper is only ever reached by a student who has FINISHED the
 * original. That matters for the granted-extra case: a student whose first
 * sitting died mid-exam has not sat the original, so their granted sitting
 * redraws the ORIGINAL paper rather than silently promoting them to a paper
 * they were never meant to see first. It is also what keeps this function
 * consistent with `quiz_attempts_improvement_is_not_first`, the database CHECK
 * that refuses an improvement paper as attempt number one.
 */
export function decideNextSitting(
  allowsImprovement: boolean,
  attempts: readonly AllowanceAttempt[],
): NextSitting {
  const granted = attempts.reduce((sum, attempt) => sum + attempt.extraAttempts, 0);
  const allowance = attemptAllowance(allowsImprovement) + granted;

  if (attempts.length >= allowance) return { allowed: false, reason: 'no_attempts_left' };

  const useImprovement =
    allowsImprovement && hasFinished(attempts, 'original') && !hasFinished(attempts, 'improvement');

  return { allowed: true, paper: useImprovement ? 'improvement' : 'original' };
}

/**
 * The id of the sitting whose score is the student's grade — the highest of
 * them, which on an ordinary quiz is simply the only one.
 *
 * Resolved SERVER-SIDE and sent to the client as a flag per row, rather than
 * left to the browser to work out by comparing scores. A client-side `Math.max`
 * disagrees with the server the moment one sitting is still `pending_review`
 * with a null score, and "which of my two marks counts" is not a question the
 * product can afford to answer two different ways on two different screens.
 *
 * Ties go to the EARLIER sitting: a student who improves to exactly the same
 * mark has not improved, and showing the original as the one that counts keeps
 * the improvement from looking like it overwrote something.
 */
export function countingAttemptId(
  attempts: readonly (AllowanceAttempt & { id: string })[],
): string | null {
  // Sorted here rather than trusted from the caller. The tie-break IS the sort
  // order, so a caller that happened to pass `orderBy: { attemptNo: 'desc' }`
  // — which the overview query does — would silently invert it.
  const inOrder = [...attempts].sort((a, b) => a.attemptNo - b.attemptNo);

  let best: (AllowanceAttempt & { id: string; scaledScore: number }) | null = null;
  for (const attempt of inOrder) {
    if (attempt.scaledScore === null) continue;
    if (best === null || attempt.scaledScore > best.scaledScore) {
      best = { ...attempt, scaledScore: attempt.scaledScore };
    }
  }
  return best?.id ?? null;
}
