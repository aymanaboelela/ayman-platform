import { z } from 'zod';

/**
 * The learner's pre-attempt intro screen. Unlike every OTHER learner route in
 * this module, this one legitimately carries `scaledScore`/`passed` — but
 * only for the student's own PAST, already-finished attempts (never the
 * in-progress one), which is exactly the same "it's already theirs" carve-out
 * `submit`'s own response and the review endpoint use. Never decorated
 * `@NoAnswerLeak()` for that reason.
 */
export const ATTEMPT_STATES = [
  'in_progress',
  'overdue',
  'submitted',
  'pending_review',
  'abandoned',
] as const;

export const AttemptHistoryRowSchema = z.object({
  id: z.string(),
  attemptNo: z.number().int(),
  state: z.enum(ATTEMPT_STATES),
  submittedAt: z.string().nullable(),
  scaledScore: z.number().nullable(),
  passed: z.boolean().nullable(),
});

export const BLOCKED_REASONS = ['quiz_not_open_yet', 'quiz_closed', 'no_attempts_left', 'retry_cooldown'] as const;

export const BlockedReasonSchema = z.object({
  code: z.enum(BLOCKED_REASONS),
  availableAt: z.string().nullable(),
});

export const QuizOverviewSchema = z.object({
  quizId: z.string(),
  lessonId: z.string(),
  mode: z.enum(['practice', 'graded']),
  questionCount: z.number().int(),
  sumMarks: z.number(),
  gradeOutOf: z.number(),
  durationSeconds: z.number().int().nullable(),
  maxAttempts: z.number().int(),
  passPercent: z.number(),
  attemptsUsed: z.number().int(),
  /** `null` means unlimited (`maxAttempts === 0`). */
  attemptsRemaining: z.number().int().nullable(),
  inProgressAttemptId: z.string().nullable(),
  blocked: BlockedReasonSchema.nullable(),
  attempts: z.array(AttemptHistoryRowSchema),
});

export type AttemptHistoryRow = z.infer<typeof AttemptHistoryRowSchema>;
export type BlockedReason = z.infer<typeof BlockedReasonSchema>;
export type QuizOverview = z.infer<typeof QuizOverviewSchema>;
