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
  /** The version-level scoring weight — frozen with the question version,
   *  never re-derived from a display string. `unknown` because Prisma hands
   *  back a `Decimal`, not a plain number (same reason `ReviewRow.mark`/
   *  `maxMark` below are `unknown`) — always read through `Number(...)`.
   *  Used ONLY to compute `rightAnswerOptionIds` below (I9); never sent to
   *  the client itself (`orderOptions` drops it from the `ReviewOption` it
   *  builds). */
  fraction: unknown;
}

export interface ReviewVersionRow {
  id: string;
  type: QuestionType;
  stemHtml: string;
  generalFeedbackHtml: string | null;
  options: ReviewOptionRow[];
}

/** Choice-type questions have a correct SET of options; short_answer/essay do
 *  not (a pattern, or nothing at all — see `describeRightAnswer`, API). */
function isChoiceType(type: QuestionType): boolean {
  return type !== 'short_answer' && type !== 'essay';
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
  /** Non-null once the question has been graded (final submit, autosubmit,
   *  or a practice `checkAnswer`). Gates `generalFeedbackHtml` alongside
   *  `response` — see B4 below. */
  gradedAt: unknown;
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
  // `gradeQuestion` (ported from Moodle) deliberately scores an unanswered
  // question as `graded_wrong` — 0 marks is the only correct SCORE for a
  // skipped question, so `row.mark`/`row.maxMark` below are right as they
  // are. But the STUDENT-FACING LABEL has its own dedicated `'unanswered'`
  // bucket (`copy.quiz.notAnswered`, rendered in muted gray, never
  // `--err`/red) specifically so a question the student never touched reads
  // as "you didn't get to this" rather than "you tried and got this wrong" —
  // `toCorrectness('graded_wrong')` collapses both into the same red
  // `'incorrect'` label, which is misleading for the former. This is checked
  // here, in the serializer, rather than in `gradeQuestion`, so it can never
  // affect the actual mark.
  if (flags.correctness) {
    payload.correctness = row.response == null ? 'unanswered' : toCorrectness(row.state);
  }
  if (flags.marks) {
    payload.mark = row.mark === null || row.mark === undefined ? null : Number(row.mark);
    payload.maxMark = Number(row.maxMark);
  }
  if (flags.specificFeedback && row.feedbackHtml) payload.feedbackHtml = row.feedbackHtml;
  // B4: `review()` deliberately carries no `@NoAnswerLeak()` guard (it is the
  // one learner route allowed to show answer data, gated by the window
  // matrix instead) — but the matrix's `during` window is resolved for the
  // WHOLE attempt from a single `submittedAt`/`now` pair, with no per-question
  // condition. `generalFeedbackHtml` comes straight off the question bank
  // (`row.version`) and is populated the instant the author writes it, so
  // without this gate a practice quiz (the default mode) handed the model
  // answer's explanation for EVERY question the moment an attempt started —
  // before the student answered a single one. The per-question condition
  // mirrors why `feedbackHtml`/`rightAnswerText` above are already safe: they
  // are columns on `attempt_questions` written only at grade time, so a null
  // value incidentally gates them. `generalFeedbackHtml` has no such column
  // of its own to gate on, so the gate is explicit here instead.
  if (
    flags.generalFeedback &&
    row.version.generalFeedbackHtml &&
    (row.response != null || row.gradedAt != null)
  ) {
    payload.generalFeedbackHtml = row.version.generalFeedbackHtml;
  }
  if (flags.rightAnswer && row.rightAnswerText) payload.rightAnswerText = row.rightAnswerText;
  // I9: the review UI used to highlight the correct option by re-splitting
  // `rightAnswerText` on `copy.quiz.answerListSeparator` and matching the
  // resulting fragments back against option bodies BY TEXT. That round trip
  // is lossy the instant an option's own body contains the same separator
  // (an ordinary Arabic list comma) — a fragment can equal a DIFFERENT
  // option's text and highlight it instead. Shipping the actual option ids
  // here, straight off the frozen version's own `fraction` field, removes
  // the round trip entirely: the client drives the highlight off id
  // membership, never off re-parsed prose.
  //
  // ⚠️ The SAME per-question gate as `generalFeedbackHtml` above, and for
  // exactly the reason B4 records — this is that bug reintroduced, not a new
  // one. `rightAnswerText` on the line above is safe by accident: it is a
  // column on `attempt_questions` written only at grade time, so a null value
  // gates it. `rightAnswerOptionIds` is not a column at all. It is DERIVED,
  // here, from `row.version.options`, which is the frozen question bank row
  // and is fully populated from the instant the attempt is created.
  //
  // So on a practice quiz — the default mode, whose matrix grants
  // `during.rightAnswer` — every choice question shipped its correct option
  // ids to the browser the moment the attempt started, before the student had
  // answered anything. The client uses them to highlight the right option, so
  // this is not merely present in a payload: it is the answer key, in the
  // shape the UI already knows how to draw.
  //
  // I9 replaced a text round-trip with these ids for good reasons (see below)
  // and inherited none of B4's gate, because the value it replaced was a
  // grade-time column and the new one is not.
  if (
    flags.rightAnswer &&
    isChoiceType(row.version.type) &&
    (row.response != null || row.gradedAt != null)
  ) {
    const rightAnswerOptionIds = row.version.options
      .filter((option) => Number(option.fraction) > 0)
      .map((option) => option.id);
    if (rightAnswerOptionIds.length > 0) payload.rightAnswerOptionIds = rightAnswerOptionIds;
  }

  return payload;
}
