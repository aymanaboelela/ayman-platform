import type { AttemptQuestionState, QuestionType } from '../../../generated/prisma/enums';
import { clamp, fractionToState } from './fraction';
import { compareStringWithWildcard } from './wildcard';

export interface GradableOption {
  id: string;
  fraction: number;
  position: number;
  /** short_answer only — the raw match pattern, never HTML. */
  answerPattern?: string | null;
}

export interface GradableQuestion {
  type: QuestionType;
  options: GradableOption[];
  caseSensitive: boolean;
}

export type QuestionResponse =
  | { kind: 'choice'; optionIds: string[] }
  | { kind: 'text'; text: string };

export interface QuestionGrade {
  /** null ONLY for essay, which a human grades. */
  fraction: number | null;
  state: AttemptQuestionState;
  matchedOptionIds: string[];
}

const WRONG: QuestionGrade = { fraction: 0, state: 'graded_wrong', matchedOptionIds: [] };

/**
 * B6, defense-in-depth. `compareStringWithWildcard` is now a linear matcher
 * with no backtracking, so this cap is no longer load-bearing for the
 * catastrophic-regex failure mode — but the graded text is still whatever a
 * student typed (up to `SaveAnswersDto`'s 20,000-char ceiling) times however
 * many patterns an instructor attached, evaluated synchronously inside the
 * grading transaction. Capping the slice actually graded keeps that work
 * bounded regardless of what future changes touch the matcher.
 */
const MAX_GRADED_ANSWER_CHARS = 2000;

/**
 * Every algorithm below is Moodle's, ported directly. The only thing this
 * function is allowed to read is the question version and the stored response —
 * never anything the client sent alongside the submit request.
 */
export function gradeQuestion(
  question: GradableQuestion,
  response: QuestionResponse | null,
): QuestionGrade {
  switch (question.type) {
    case 'essay':
      // v1 never auto-grades an essay, not even an empty one: "the student
      // wrote nothing" is a judgement, and a 0 awarded by a machine on a
      // written answer is the fastest route to an appeal we cannot defend.
      return { fraction: null, state: 'needs_grading', matchedOptionIds: [] };

    case 'mcq_single':
    case 'true_false': {
      if (response?.kind !== 'choice' || response.optionIds.length !== 1) return WRONG;
      const chosen = question.options.find((option) => option.id === response.optionIds[0]);
      if (!chosen) return WRONG;
      // fraction = chosenOption.fraction, verbatim. It may be negative; the
      // per-question floor is applied later, from the snapshotted minFraction.
      return {
        fraction: chosen.fraction,
        state: fractionToState(chosen.fraction),
        matchedOptionIds: [chosen.id],
      };
    }

    case 'mcq_multi': {
      if (response?.kind !== 'choice') return WRONG;
      const ticked = question.options.filter((option) => response.optionIds.includes(option.id));
      const sum = ticked.reduce((total, option) => total + option.fraction, 0);
      // The clamp at 0 is the whole reason a student cannot go sub-zero on a
      // single question by ticking every distractor.
      const fraction = clamp(sum, 0, 1);
      return {
        fraction,
        state: fractionToState(fraction),
        matchedOptionIds: ticked.map((option) => option.id),
      };
    }

    case 'short_answer': {
      if (response?.kind !== 'text' || response.text.trim() === '') return WRONG;
      const gradedText = response.text.slice(0, MAX_GRADED_ANSWER_CHARS);
      const patterns = [...question.options].sort((a, b) => a.position - b.position);
      for (const pattern of patterns) {
        if (!pattern.answerPattern) continue;
        if (compareStringWithWildcard(gradedText, pattern.answerPattern, !question.caseSensitive)) {
          // FIRST match wins — later patterns are never consulted, exactly as
          // Moodle's get_matching_answer() does it.
          return {
            fraction: pattern.fraction,
            state: fractionToState(pattern.fraction),
            matchedOptionIds: [pattern.id],
          };
        }
      }
      return WRONG;
    }

    default: {
      // Exhaustiveness: a new QuestionType must be handled here explicitly.
      const exhaustive: never = question.type;
      void exhaustive;
      return WRONG;
    }
  }
}
