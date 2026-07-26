import type { ReviewFlags, ReviewOptions, ReviewWindow } from '@ayman/contracts/quiz/quiz-settings';
import type { Correctness, ReviewOption, ReviewQuestion } from '@ayman/contracts/quiz/attempt';
import type { AttemptQuestionState, QuestionType } from '../../../generated/prisma/enums';

/** Moodle: quiz_attempt::IMMEDIATELY_AFTER_PERIOD = 2 * MINSECS. */
export const IMMEDIATELY_AFTER_SECONDS = 120;

/**
 * Ported from Moodle's quiz_attempt::get_attempt_state(). Order matters: the
 * 120-second grace beats a quiz that closed during it, so a student who
 * submits at the buzzer still sees their result.
 */
export function resolveReviewWindow(args: {
  submittedAt: Date | null;
  openUntil: Date | null;
  now: Date;
}): ReviewWindow {
  if (!args.submittedAt) return 'during';
  const elapsedSeconds = (args.now.getTime() - args.submittedAt.getTime()) / 1000;
  if (elapsedSeconds < IMMEDIATELY_AFTER_SECONDS) return 'immediatelyAfter';
  if (!args.openUntil || args.now < args.openUntil) return 'laterWhileOpen';
  return 'afterClose';
}

export function resolveReviewFlags(options: ReviewOptions, window: ReviewWindow): ReviewFlags {
  return options[window];
}

/** The raw enum value is never sent to a learner — this is the ONE place the
 *  six-value grading state collapses to the five-value learner label. */
const CORRECTNESS_BY_STATE: Record<AttemptQuestionState, Correctness> = {
  todo: 'unanswered',
  // Answered but not yet graded/checked (practice mode, before `checkAnswer`
  // or final submit runs). There is no verdict to show yet, so this shares
  // the same bucket as an ungraded essay rather than inventing a sixth label.
  complete: 'needsGrading',
  needs_grading: 'needsGrading',
  graded_right: 'correct',
  graded_partial: 'partial',
  graded_wrong: 'incorrect',
};

export function toCorrectness(state: AttemptQuestionState): Correctness {
  return CORRECTNESS_BY_STATE[state];
}

export interface ReviewOptionRow {
  id: string;
  bodyHtml: string;
  position: number;
}

export interface ReviewVersionRow {
  id: string;
  type: QuestionType;
  stemHtml: string;
  generalFeedbackHtml: string | null;
  options: ReviewOptionRow[];
}

export interface ReviewRow {
  id: string;
  slotPosition: number;
  optionOrder: number[];
  response: unknown;
  mark: unknown;
  maxMark: unknown;
  state: AttemptQuestionState;
  feedbackHtml: string | null;
  rightAnswerText: string | null;
  version: ReviewVersionRow;
}

/** Same snapshotted-order replay as the learner serializer — the review
 *  screen shows the paper exactly as the student sat it. */
function orderOptions(options: ReviewOptionRow[], optionOrder: readonly number[]): ReviewOption[] {
  const byPosition = new Map(options.map((option) => [option.position, option]));
  const ordered: ReviewOption[] = [];
  const used = new Set<number>();

  for (const position of optionOrder) {
    const option = byPosition.get(position);
    if (option && !used.has(position)) {
      ordered.push({ id: option.id, bodyHtml: option.bodyHtml });
      used.add(position);
    }
  }
  for (const option of options) {
    if (!used.has(option.position)) {
      ordered.push({ id: option.id, bodyHtml: option.bodyHtml });
    }
  }
  return ordered;
}

/**
 * Builds the payload by ADDING permitted fields to a base shape. A "null it
 * out" approach still ships the key, and a key whose value is null is itself
 * information ("this field exists, you just can't see it"). Omission is the
 * only version of this that is actually a control.
 */
export function toReviewQuestion(row: ReviewRow, flags: ReviewFlags): ReviewQuestion {
  const payload: ReviewQuestion = {
    slotPosition: row.slotPosition,
    questionId: row.version.id,
    attemptQuestionId: row.id,
    type: row.version.type,
    stemHtml: row.version.stemHtml,
    options: orderOptions(row.version.options, row.optionOrder),
  };

  if (flags.response) payload.response = row.response ?? null;
  if (flags.correctness) payload.correctness = toCorrectness(row.state);
  if (flags.marks) {
    payload.mark = row.mark === null || row.mark === undefined ? null : Number(row.mark);
    payload.maxMark = Number(row.maxMark);
  }
  if (flags.specificFeedback && row.feedbackHtml) payload.feedbackHtml = row.feedbackHtml;
  if (flags.generalFeedback && row.version.generalFeedbackHtml) {
    payload.generalFeedbackHtml = row.version.generalFeedbackHtml;
  }
  if (flags.rightAnswer && row.rightAnswerText) payload.rightAnswerText = row.rightAnswerText;

  return payload;
}
