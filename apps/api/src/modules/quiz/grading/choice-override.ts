import { copy } from '@ayman/contracts/copy';
import { htmlToPlainText } from '@ayman/contracts/quiz/rich-text';
import type { QuestionType } from '../../../generated/prisma/enums';

/**
 * An instructor correcting the RECORDED answer on a choice question, from the
 * marking screen — the only path in the product that writes a student's
 * response after submission, so it is checked here rather than trusted.
 *
 * Ordering is deliberately absent: its answer is a whole sequence, and the
 * marking screen shows it read-only. Text answers are absent too — rewriting
 * what a student wrote is authorship, not a correction (`AdminGradeAnswerSchema`
 * refuses the shape before it gets here).
 */
export const CORRECTABLE_TYPES: readonly QuestionType[] = ['mcq_single', 'true_false', 'mcq_multi'];

export type ChoiceOverrideRefusal =
  /** Not a choice question — or one whose answer is a sequence. */
  | 'response_not_editable'
  /** A single-answer question handed more than one option. */
  | 'response_shape_invalid'
  /** An id that is not one of THIS question version's options — another
   *  question's, a deleted one, or something typed by hand. */
  | 'response_option_not_in_question';

export interface OverrideOption {
  id: string;
  bodyHtml: string;
}

/**
 * The override as it will be stored, or why it may not be.
 *
 * Duplicates are dropped and the ids come back in the version's OWN option
 * order, so two corrections naming the same answer store the same value and
 * `responseText` reads the way the paper does.
 */
export function checkChoiceOverride(
  type: QuestionType,
  options: readonly OverrideOption[],
  optionIds: readonly string[],
): { ok: true; optionIds: string[] } | { ok: false; code: ChoiceOverrideRefusal } {
  if (!CORRECTABLE_TYPES.includes(type)) return { ok: false, code: 'response_not_editable' };

  const wanted = new Set(optionIds);
  if (wanted.size === 0) return { ok: false, code: 'response_shape_invalid' };
  if (type !== 'mcq_multi' && wanted.size !== 1) return { ok: false, code: 'response_shape_invalid' };

  const known = new Set(options.map((option) => option.id));
  for (const id of wanted) {
    if (!known.has(id)) return { ok: false, code: 'response_option_not_in_question' };
  }

  return { ok: true, optionIds: options.filter((option) => wanted.has(option.id)).map((option) => option.id) };
}

/**
 * `attempt_questions.response_text` for a choice answer: the chosen options'
 * TEXT, joined the way the review screen joins a model answer.
 *
 * The correction path used to write `optionIds.join(', ')` — a row of UUIDs —
 * into the column every admin surface prints as "what the student answered".
 * This is the same rendering `describeResponse` in `attempt.service.ts` gives
 * the column at submit time, so a corrected row reads exactly like one that
 * was never touched.
 */
export function describeChoice(options: readonly OverrideOption[], optionIds: readonly string[]): string | null {
  const chosen = options.filter((option) => optionIds.includes(option.id));
  if (chosen.length === 0) return null;
  return chosen
    .map((option) => htmlToPlainText(option.bodyHtml).replace(/\s+/g, ' ').trim())
    .join(copy.quiz.answerListSeparator);
}
