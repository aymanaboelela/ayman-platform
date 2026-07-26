import type { AttemptQuestionState, AttemptState } from '../../../generated/prisma/enums';
import { clamp, roundMark } from './fraction';

export interface GradedQuestionRow {
  fraction: number | null;
  maxMark: number;
  /** Snapshotted per-question floor, from the version's lowest option weight. */
  minFraction: number;
  maxFraction: number;
  state: AttemptQuestionState;
}

export interface AttemptGrade {
  rawScore: number;
  scaledScore: number;
  passed: boolean;
  needsGrading: boolean;
  attemptState: Extract<AttemptState, 'submitted' | 'pending_review'>;
}

export function gradeAttempt(
  questions: readonly GradedQuestionRow[],
  quiz: { sumMarks: number; gradeOutOf: number; passPercent: number },
): AttemptGrade {
  let total = 0;
  let needsGrading = false;

  for (const question of questions) {
    if (question.state === 'needs_grading' || question.fraction === null) {
      // An ungraded essay contributes 0 until a human grades it. The attempt is
      // flagged pending_review so nobody reads that 0 as a final result.
      needsGrading = true;
      continue;
    }
    const bounded = clamp(question.fraction, question.minFraction, question.maxFraction);
    total += bounded * question.maxMark;
  }

  // The attempt-level floor. Per-question negatives are legal; a negative TOTAL
  // is not — there is no pedagogic meaning to "you scored -3 out of 20".
  const rawScore = roundMark(Math.max(0, total));
  const scaledScore =
    quiz.sumMarks > 0 ? roundMark((rawScore / quiz.sumMarks) * quiz.gradeOutOf) : 0;
  const passMark = (quiz.passPercent / 100) * quiz.gradeOutOf;

  return {
    rawScore,
    scaledScore,
    // A pending essay can only ever raise the score, so a provisional pass is
    // honest and a provisional fail is not final — the UI says so in copy.
    passed: scaledScore >= passMark,
    needsGrading,
    attemptState: needsGrading ? 'pending_review' : 'submitted',
  };
}
