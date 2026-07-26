import { z } from 'zod';

/**
 * Four time windows. Resolution is SERVER-SIDE (see the API's review
 * serializer); the client never decides which window it is in, and disallowed
 * fields are removed from the payload rather than hidden with CSS.
 */
export const REVIEW_WINDOWS = ['during', 'immediatelyAfter', 'laterWhileOpen', 'afterClose'] as const;

/** Seven visibility flags, matching Moodle's review-options bitmask semantics. */
export const REVIEW_FLAGS = [
  'response',
  'correctness',
  'marks',
  'specificFeedback',
  'generalFeedback',
  'rightAnswer',
  'overallFeedback',
] as const;

export type ReviewWindow = (typeof REVIEW_WINDOWS)[number];
export type ReviewFlag = (typeof REVIEW_FLAGS)[number];

const ReviewFlagsSchema = z.object({
  response: z.boolean(),
  correctness: z.boolean(),
  marks: z.boolean(),
  specificFeedback: z.boolean(),
  generalFeedback: z.boolean(),
  rightAnswer: z.boolean(),
  overallFeedback: z.boolean(),
});

export const ReviewOptionsSchema = z.object({
  during: ReviewFlagsSchema,
  immediatelyAfter: ReviewFlagsSchema,
  laterWhileOpen: ReviewFlagsSchema,
  afterClose: ReviewFlagsSchema,
});

export type ReviewFlags = z.infer<typeof ReviewFlagsSchema>;
export type ReviewOptions = z.infer<typeof ReviewOptionsSchema>;

const allFlags = (value: boolean): ReviewFlags => ({
  response: value,
  correctness: value,
  marks: value,
  specificFeedback: value,
  generalFeedback: value,
  rightAnswer: value,
  overallFeedback: value,
});

/**
 * Practice: instant per-question feedback while the attempt is open, but the
 * model answer is still withheld until submission — otherwise "practice" is
 * just an answer key with extra steps.
 */
export const DEFAULT_REVIEW_OPTIONS_PRACTICE: ReviewOptions = {
  during: {
    response: true,
    correctness: true,
    marks: true,
    specificFeedback: true,
    generalFeedback: true,
    rightAnswer: false,
    overallFeedback: false,
  },
  immediatelyAfter: allFlags(true),
  laterWhileOpen: allFlags(true),
  afterClose: allFlags(true),
};

/** Graded: nothing during the attempt, everything once it is submitted. */
export const DEFAULT_REVIEW_OPTIONS_GRADED: ReviewOptions = {
  during: allFlags(false),
  immediatelyAfter: allFlags(true),
  laterWhileOpen: {
    response: true,
    correctness: true,
    marks: true,
    specificFeedback: true,
    generalFeedback: true,
    rightAnswer: false,
    overallFeedback: true,
  },
  afterClose: allFlags(true),
};

export const QuizModeSchema = z.enum(['practice', 'graded']);
export const GradeMethodSchema = z.enum(['highest', 'average', 'first', 'last']);
export const OverdueHandlingSchema = z.enum(['autosubmit', 'graceperiod', 'autoabandon']);
export const NavMethodSchema = z.enum(['free', 'sequential']);

export const QuizSettingsSchema = z
  .object({
    // Practice is the default in all three places it can be defaulted: here,
    // in schema.prisma, and in the builder form's defaultValues.
    mode: QuizModeSchema.default('practice'),
    durationSeconds: z.number().int().positive().nullable().default(null),
    openFrom: z.coerce.date().nullable().default(null),
    openUntil: z.coerce.date().nullable().default(null),
    maxAttempts: z.number().int().min(0).default(0),
    gradeMethod: GradeMethodSchema.default('highest'),
    retryCooldownHours: z.number().int().min(0).default(24),
    passPercent: z.number().min(0).max(100).default(70),
    shuffleQuestions: z.boolean().default(false),
    shuffleOptions: z.boolean().default(true),
    overdueHandling: OverdueHandlingSchema.default('autosubmit'),
    graceSeconds: z.number().int().min(0).default(60),
    navMethod: NavMethodSchema.default('free'),
    gradeOutOf: z.number().positive().default(100),
    reviewOptions: ReviewOptionsSchema,
  })
  .refine(
    (value) =>
      value.openFrom === null || value.openUntil === null || value.openUntil > value.openFrom,
    { message: 'openUntil must be after openFrom', path: ['openUntil'] },
  );

export type QuizSettings = z.infer<typeof QuizSettingsSchema>;
export type QuizMode = z.infer<typeof QuizModeSchema>;
