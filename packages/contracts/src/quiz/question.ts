import { z } from 'zod';
// Self-referencing package subpath, NOT a relative import: this file is the
// first contracts leaf module consumed as a runtime VALUE by apps/api (Task
// 7's question DTO) that also needs a sibling leaf module. Node's ESM loader
// resolves `../copy/ar` relative specifiers only when the exact extension is
// present, and never appends one — that broke `dist/main.js` at boot the
// moment anything actually imported this file for its value (hazard H3;
// `packages/contracts/package.json`'s exports map already gives `./copy` and
// `./quiz/question` explicit `.ts` targets, so importing through the
// package's own name resolves the same way a consumer in apps/api would).
import { copy } from '@ayman/contracts/copy';

/**
 * Weights are compared with a tolerance, never with `===`. Ten options at 0.1
 * sum to 0.9999999999999999 in IEEE-754; an exact comparison would reject a
 * perfectly ordinary ten-option question. The same epsilon family is used
 * server-side to turn a fraction into a state (see the API's grading module).
 */
const WEIGHT_EPSILON = 1e-6;

export const QUESTION_TYPES = [
  'mcq_single',
  'mcq_multi',
  'true_false',
  'short_answer',
  'essay',
] as const;

export const QuestionTypeSchema = z.enum(QUESTION_TYPES);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;

/**
 * The scoring primitive. `fraction` is a weight in [-1, 1] — NOT a boolean.
 * Negative values are per-option negative marking and are deliberately legal.
 */
export const ChoiceOptionSchema = z.object({
  id: z.string().optional(),
  bodyHtml: z.string().min(1, copy.quizErrors.optionBodyRequired),
  fraction: z
    .number()
    .min(-1, copy.quizErrors.fractionRange)
    .max(1, copy.quizErrors.fractionRange),
  feedbackHtml: z.string().optional(),
});

export const PatternOptionSchema = z.object({
  id: z.string().optional(),
  answerPattern: z.string().min(1, copy.quizErrors.patternRequired),
  fraction: z
    .number()
    .min(-1, copy.quizErrors.fractionRange)
    .max(1, copy.quizErrors.fractionRange),
  feedbackHtml: z.string().optional(),
});

export const QuestionSettingsSchema = z.object({
  shuffleOptions: z.boolean().default(true),
  caseSensitive: z.boolean().default(false),
  minWords: z.number().int().min(0).optional(),
  maxWords: z.number().int().min(0).optional(),
  /** Instructor-only. Stripped by the learner serializer, never sent to a student. */
  graderInfo: z.string().optional(),
});

const baseFields = {
  categoryId: z.string().min(1),
  stemHtml: z.string().min(1, copy.quizErrors.stemRequired),
  generalFeedbackHtml: z.string().optional(),
  defaultMark: z.number().positive().default(1),
  // `.prefault()`, not `.default()`: zod 4 types `.default()`'s argument as
  // the schema's OUTPUT (every nested default already applied), so `{}`
  // fails to typecheck against it. `.prefault()` takes the INPUT type
  // instead and re-parses it through the schema, which is what lets `{}`
  // pick up `shuffleOptions`/`caseSensitive`'s own field-level defaults.
  settings: QuestionSettingsSchema.prefault({}),
};

const countFullCredit = (options: readonly { fraction: number }[]): number =>
  options.filter((option) => option.fraction > 1 - WEIGHT_EPSILON).length;

/**
 * ⚠️ Every refinement below lives INSIDE its union member and carries an
 * explicit `path`. A `.refine()` applied to the union itself would produce an
 * issue at `path: []`, which react-hook-form cannot attach to any field — the
 * form would refuse to submit while displaying no error at all. This is the
 * single most common way a shared discriminated-union schema silently breaks
 * an admin form, and `question.spec.ts` asserts against it explicitly.
 */
const McqSingleSchema = z
  .object({ ...baseFields, type: z.literal('mcq_single'), options: z.array(ChoiceOptionSchema) })
  .refine((value) => value.options.length >= 2, {
    message: copy.quizErrors.atLeastTwoOptions,
    path: ['options'],
  })
  .refine((value) => countFullCredit(value.options) === 1, {
    message: copy.quizErrors.exactlyOneCorrect,
    path: ['options'],
  });

const McqMultiSchema = z
  .object({ ...baseFields, type: z.literal('mcq_multi'), options: z.array(ChoiceOptionSchema) })
  .refine((value) => value.options.length >= 2, {
    message: copy.quizErrors.atLeastTwoOptions,
    path: ['options'],
  })
  .refine((value) => value.options.some((option) => option.fraction > 0), {
    message: copy.quizErrors.multiNeedsPositive,
    path: ['options'],
  })
  // The API grades multi-choice as clamp(Σ ticked fractions, 0, 1). Requiring
  // the positive weights to sum to 1 here is what makes that clamp equivalent
  // to Moodle's normalised form — a student who ticks every correct option and
  // nothing else scores exactly 1.
  .refine(
    (value) =>
      Math.abs(
        value.options
          .filter((option) => option.fraction > 0)
          .reduce((sum, option) => sum + option.fraction, 0) - 1,
      ) < WEIGHT_EPSILON,
    { message: copy.quizErrors.multiWeightsMustSumToOne, path: ['options'] },
  );

const TrueFalseSchema = z
  .object({ ...baseFields, type: z.literal('true_false'), options: z.array(ChoiceOptionSchema) })
  .refine((value) => value.options.length === 2, {
    message: copy.quizErrors.trueFalseNeedsTwo,
    path: ['options'],
  })
  .refine((value) => countFullCredit(value.options) === 1, {
    message: copy.quizErrors.exactlyOneCorrect,
    path: ['options'],
  });

const ShortAnswerSchema = z
  .object({ ...baseFields, type: z.literal('short_answer'), options: z.array(PatternOptionSchema) })
  .refine((value) => countFullCredit(value.options) >= 1, {
    message: copy.quizErrors.shortAnswerNeedsFullCredit,
    path: ['options'],
  });

const EssaySchema = z
  .object({ ...baseFields, type: z.literal('essay'), options: z.array(z.never()).default([]) })
  .refine((value) => value.options.length === 0, {
    message: copy.quizErrors.essayHasNoOptions,
    path: ['options'],
  })
  .refine(
    (value) =>
      value.settings.minWords === undefined ||
      value.settings.maxWords === undefined ||
      value.settings.maxWords >= value.settings.minWords,
    { message: copy.quizErrors.maxWordsBelowMin, path: ['settings', 'maxWords'] },
  );

/**
 * ONE schema, TWO consumers: the admin's react-hook-form resolver and the
 * API's `createZodDto`. There is no second definition of a question anywhere,
 * so the form and the server cannot drift.
 */
export const QuestionInputSchema = z.discriminatedUnion('type', [
  McqSingleSchema,
  McqMultiSchema,
  TrueFalseSchema,
  ShortAnswerSchema,
  EssaySchema,
]);

export type QuestionInput = z.infer<typeof QuestionInputSchema>;
export type ChoiceOptionInput = z.infer<typeof ChoiceOptionSchema>;
export type PatternOptionInput = z.infer<typeof PatternOptionSchema>;
export type QuestionSettings = z.infer<typeof QuestionSettingsSchema>;

/** Whether a type carries choice options (as opposed to patterns or nothing). */
export function hasChoiceOptions(type: QuestionType): boolean {
  return type === 'mcq_single' || type === 'mcq_multi' || type === 'true_false';
}
