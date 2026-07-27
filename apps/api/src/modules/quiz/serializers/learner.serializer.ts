import type { QuestionType } from '../../../generated/prisma/enums';

/**
 * LAYER 1. The only select any pre-submission read path may use. `fraction`,
 * `feedbackHtml`, `answerPattern`, `generalFeedbackHtml` and `penalty` are
 * absent, so the values never enter this process at all.
 *
 * NEVER replace this with `include` — `include: { options: true }` pulls
 * `fraction` and `answerPattern` and is the single most likely way this
 * property gets broken by a future change.
 */
export const LEARNER_QUESTION_SELECT = {
  id: true,
  type: true,
  stemHtml: true,
  settings: true,
  options: {
    orderBy: { position: 'asc' },
    select: { id: true, bodyHtml: true, position: true },
  },
} as const;

/**
 * Any of these appearing in a pre-submission response body is a leak. The list
 * is deliberately broad; the learner payload's field names were chosen to avoid
 * colliding with it (the attempt's lifecycle field is `status`, not `state`,
 * and a question's grading state is projected to `answered: boolean`).
 */
export const FORBIDDEN_ANSWER_KEYS: ReadonlySet<string> = new Set([
  'fraction',
  'isCorrect',
  'correct',
  'correctness',
  'feedback',
  'feedbackHtml',
  'generalFeedbackHtml',
  'specificFeedback',
  'rightAnswer',
  'rightAnswerText',
  'rightAnswerOptionIds',
  'answerPattern',
  'answerPatterns',
  'graderInfo',
  'penalty',
  'mark',
  'marks',
  'maxFraction',
  'minFraction',
  'rawScore',
  'scaledScore',
  'passed',
  'state',
  'matchedOptionIds',
]);

export interface LearnerOption {
  id: string;
  bodyHtml: string;
}

export interface LearnerQuestion {
  slotPosition: number;
  questionId: string;
  type: QuestionType;
  stemHtml: string;
  maxMark: number;
  options: LearnerOption[];
  response: unknown;
  flagged: boolean;
  /** Projection of AttemptQuestionState. `graded_right` must never ship. */
  answered: boolean;
  settings: { minWords?: number; maxWords?: number };
}

interface QuestionVersionRow {
  id: string;
  type: QuestionType;
  stemHtml: string;
  settings: unknown;
  options: { id: string; bodyHtml: string; position: number }[];
}

interface AttemptQuestionRow {
  slotPosition: number;
  maxMark: unknown;
  optionOrder: number[];
  response: unknown;
  flagged: boolean;
  state: string;
}

/**
 * Applies the SNAPSHOTTED option order. Any position present in the snapshot
 * comes first, in snapshot order; anything not mentioned follows in stored
 * order, so a malformed snapshot degrades to "slightly wrong order" rather than
 * "the student loses a question".
 */
function orderOptions(
  options: readonly { id: string; bodyHtml: string; position: number }[],
  optionOrder: readonly number[],
): LearnerOption[] {
  const byPosition = new Map(options.map((option) => [option.position, option]));
  const ordered: LearnerOption[] = [];
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

/** LAYER 2. Field-by-field construction — there is no spread of a DB row here. */
export function toLearnerQuestion(
  version: QuestionVersionRow,
  attemptQuestion: AttemptQuestionRow,
): LearnerQuestion {
  const settings = (version.settings ?? {}) as Record<string, unknown>;
  const projected: { minWords?: number; maxWords?: number } = {};
  if (typeof settings.minWords === 'number') projected.minWords = settings.minWords;
  if (typeof settings.maxWords === 'number') projected.maxWords = settings.maxWords;

  return {
    slotPosition: attemptQuestion.slotPosition,
    questionId: version.id,
    type: version.type,
    stemHtml: version.stemHtml,
    maxMark: Number(attemptQuestion.maxMark),
    options: orderOptions(version.options, attemptQuestion.optionOrder),
    response: attemptQuestion.response ?? null,
    flagged: attemptQuestion.flagged,
    answered: attemptQuestion.state !== 'todo',
    settings: projected,
  };
}

/** Every key at every depth, cycle-safe. Used by the interceptor and the tests. */
export function collectKeysDeep(value: unknown): Set<string> {
  const keys = new Set<string>();
  const seen = new WeakSet<object>();

  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      keys.add(key);
      walk(child);
    }
  };

  walk(value);
  return keys;
}
