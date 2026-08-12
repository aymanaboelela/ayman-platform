import { z } from '@ayman/contracts/zod';

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
 * Nothing during the attempt, everything once it is submitted.
 *
 * There used to be a second default here, `DEFAULT_REVIEW_OPTIONS_PRACTICE`,
 * paired with a `practice` quiz mode that revealed correctness mid-attempt and
 * allowed unlimited sittings. Both are gone: every quiz is now one graded
 * sitting, so a second default would only be a way to reintroduce the loop by
 * accident.
 *
 * The 4×7 matrix itself stays fully configurable — it answers "what may the
 * student see, and when", which is orthogonal to how many times they may sit.
 */
export const DEFAULT_REVIEW_OPTIONS: ReviewOptions = {
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

export const OverdueHandlingSchema = z.enum(['autosubmit', 'graceperiod', 'autoabandon']);
export const NavMethodSchema = z.enum(['free', 'sequential']);

/**
 * Which of a quiz's two papers a slot belongs to, and which one an attempt was
 * drawn from.
 *
 * A course's improvement sitting (تحسين) is a SECOND PAPER on the SAME quiz,
 * not a second quiz. `Quiz.lessonId` is unique and an exam is a lesson, so a
 * separate improvement quiz would have to be a separate lesson — and that
 * creates a second "the student's exam score" that can drift from the first.
 * One quiz with two papers keeps exactly one score, one gate rule, and one
 * grading path.
 */
export const QuizPaperSchema = z.enum(['original', 'improvement']);
export const QUIZ_PAPERS = ['original', 'improvement'] as const;

export const QuizSettingsSchema = z
  .object({
    durationSeconds: z.number().int().positive().nullable().default(null),
    openFrom: z.coerce.date().nullable().default(null),
    openUntil: z.coerce.date().nullable().default(null),
    /**
     * Offers ONE extra sitting on the improvement paper, and the higher of the
     * two scores counts. Only ever true on a course's final exam.
     *
     * This replaced `maxAttempts` / `retryCooldownHours` / `gradeMethod`. Those
     * three made "how many times may a student sit this, and which sitting
     * counts" a matrix of 4 × ∞ × 4 configurations, whose DEFAULT was unlimited
     * attempts. The allowance is now a rule in one place — one sitting, or two
     * on an improvable exam — and the grade is always the highest.
     */
    allowsImprovement: z.boolean().default(false),
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
export type QuizPaper = z.infer<typeof QuizPaperSchema>;

/**
 * How many sittings a quiz allows, as a rule rather than a column.
 *
 * The ONLY place this number is decided. `quiz-access.service.ts` asks it, the
 * overview serializer asks it, and the admin surfaces state it — none of them
 * re-derive it, because three copies of "how many attempts" is exactly how the
 * old `maxAttempts` default of *unlimited* survived as long as it did.
 */
export function attemptAllowance(allowsImprovement: boolean): number {
  return allowsImprovement ? 2 : 1;
}
