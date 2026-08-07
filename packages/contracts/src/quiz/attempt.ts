import type { QuestionType } from './question';
import type { ReviewWindow } from './quiz-settings';

/**
 * The five learner-facing correctness labels. The raw `AttemptQuestionState`
 * enum (`todo` / `complete` / `needs_grading` / `graded_right` /
 * `graded_partial` / `graded_wrong`) is never sent as-is — `toCorrectness`
 * (API's `review.serializer.ts`) is the one place that projection happens.
 */
export const CORRECTNESS_VALUES = [
  'correct',
  'partial',
  'incorrect',
  'needsGrading',
  'unanswered',
] as const;
export type Correctness = (typeof CORRECTNESS_VALUES)[number];

export interface ReviewOption {
  id: string;
  bodyHtml: string;
}

/**
 * Built by ADDING permitted fields to a base shape — every optional field
 * below is present ONLY when the resolved 4x7 matrix flag for it is true.
 * There is no "send null to hide it" variant: a key whose value is null is
 * itself information, so omission is the only version of this that is
 * actually a control (enforced server-side, see `toReviewQuestion`).
 */
export interface ReviewQuestion {
  slotPosition: number;
  questionId: string;
  /** The `attempt_questions` row id — never gated by the review matrix (it is
   *  not answer data). The review screen keys its per-question anchors and its
   *  «وريني غلطاتي بس» filter off this. */
  attemptQuestionId: string;
  type: QuestionType;
  stemHtml: string;
  options: ReviewOption[];
  /** Present iff `response` flag is on. The student's own stored answer. */
  response?: unknown;
  /** Present iff `correctness` flag is on. */
  correctness?: Correctness;
  /** Present iff `marks` flag is on. */
  mark?: number | null;
  maxMark?: number;
  /** Present iff `specificFeedback` flag is on. */
  feedbackHtml?: string;
  /** Present iff `generalFeedback` flag is on. */
  generalFeedbackHtml?: string;
  /** Present iff `rightAnswer` flag is on. Display prose only — a joined,
   *  human-readable string (may legitimately contain the same separator
   *  punctuation an option's own text uses). Never parsed back apart to
   *  figure out which option is correct; see `rightAnswerOptionIds`. */
  rightAnswerText?: string;
  /** Present iff `rightAnswer` flag is on AND the question is a choice type
   *  (mcq_single/mcq_multi/true_false). The correct options' own ids,
   *  carried as a structured array end to end — NOT derived by splitting
   *  `rightAnswerText` back apart. Driving the review screen's per-option
   *  highlight off id membership (rather than re-splitting a joined string
   *  on a separator that an option's own text may itself contain) is what
   *  keeps the highlight correct regardless of an option's own punctuation
   *  (I9). */
  rightAnswerOptionIds?: string[];
}

/**
 * Returned instead of a `questions` array when EVERY flag in the resolved
 * window is false — an empty array plus a `locked` flag would still tell the
 * client how many questions there were, so there is no `questions: []` case
 * for a locked review.
 */
export interface ReviewLocked {
  locked: true;
  reason: 'during' | 'awaitingClose';
}

export interface ReviewUnlocked {
  locked: false;
  attemptId: string;
  window: ReviewWindow;
  rawScore: number | null;
  scaledScore: number | null;
  gradeOutOf: number;
  sumMarks: number;
  /** So the results screen can render "درجة النجاح X%" (the pass line). */
  passPercent: number;
  passed: boolean | null;
  questions: ReviewQuestion[];
}

export type ReviewPayload = ReviewLocked | ReviewUnlocked;
