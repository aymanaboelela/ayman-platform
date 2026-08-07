import { z } from 'zod';
import { QUESTION_TYPES } from '@ayman/contracts';

/**
 * Split out of `quiz-runner.tsx` on purpose: that file starts with
 * `'use client'`, and `app/(app)/quizzes/[lessonId]/attempt/[attemptId]/page.tsx`
 * (a Server Component) needs `StartedAttemptSchema` to `.parse()` the
 * `resume()` response BEFORE handing it to `<QuizRunner>` as a prop. Next's
 * client-boundary bundling turns a `'use client'` module's non-component
 * exports into opaque references when pulled into server code — importing
 * this schema through `quiz-runner.tsx` compiles fine but fails at runtime
 * with `schema.parse is not a function`, because the schema object the
 * server actually receives across that boundary is not the real Zod schema.
 * A plain module with no `'use client'` directive has no such boundary, so
 * both the server page and the client runner import it from here instead.
 */
const LearnerOptionSchema = z.object({ id: z.string(), bodyHtml: z.string() });

const LearnerQuestionSchema = z.object({
  slotPosition: z.number(),
  questionId: z.string(),
  type: z.enum(QUESTION_TYPES),
  stemHtml: z.string(),
  maxMark: z.number(),
  options: z.array(LearnerOptionSchema),
  response: z.unknown(),
  flagged: z.boolean(),
  answered: z.boolean(),
  settings: z.object({ minWords: z.number().optional(), maxWords: z.number().optional() }),
});

export const StartedAttemptSchema = z.object({
  attemptId: z.string(),
  attemptToken: z.string(),
  deadlineAt: z.string().nullable(),
  serverTime: z.string(),
  status: z.literal('in_progress'),
  navMethod: z.enum(['free', 'sequential']),
  paper: z.enum(['original', 'improvement']),
  /** Resolved from the review matrix server-side; see `StartedAttempt`. */
  canCheckAnswer: z.boolean(),
  gradeOutOf: z.number(),
  sumMarks: z.number(),
  nextSeq: z.number(),
  graceSeconds: z.number(),
  overdueHandling: z.enum(['autosubmit', 'graceperiod', 'autoabandon']),
  questions: z.array(LearnerQuestionSchema),
});

export type StartedAttempt = z.infer<typeof StartedAttemptSchema>;
