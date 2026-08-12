import { z } from '../zod';
import { QuizPaperSchema } from './quiz-settings';

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
  /** Which paper this sitting was drawn from. Snapshotted at start. */
  paper: QuizPaperSchema,
  /**
   * Whether THIS sitting is the one whose score counts — the higher of the
   * two on an improvable exam, and always the only one otherwise.
   *
   * Computed server-side and sent, rather than left to the client to work out
   * by comparing scores. A client-side `Math.max` would disagree with the
   * server the moment an essay question is still `pending_review` and one of
   * the two scores is null.
   */
  counts: z.boolean(),
});

export const BLOCKED_REASONS = ['quiz_not_open_yet', 'quiz_closed', 'no_attempts_left'] as const;

export const BlockedReasonSchema = z.object({
  code: z.enum(BLOCKED_REASONS),
  availableAt: z.string().nullable(),
});

export const QuizOverviewSchema = z.object({
  quizId: z.string(),
  lessonId: z.string(),
  questionCount: z.number().int(),
  sumMarks: z.number(),
  gradeOutOf: z.number(),
  durationSeconds: z.number().int().nullable(),
  passPercent: z.number(),
  attemptsUsed: z.number().int(),
  /** Whether this quiz is a course's final exam offering an improvement sitting. */
  allowsImprovement: z.boolean(),
  /**
   * Which paper the NEXT sitting would draw from, or `null` when there is no
   * next sitting. The student-facing distinction between «ابدأ الامتحان» and
   * «امتحان التحسين» is this field and nothing else — the intro screen must
   * never infer it from `attemptsUsed`, because an abandoned attempt makes
   * that count lie.
   */
  nextPaper: QuizPaperSchema.nullable(),
  /** The best scaled score across finished sittings, or `null` if none scored. */
  bestScore: z.number().nullable(),
  inProgressAttemptId: z.string().nullable(),
  blocked: BlockedReasonSchema.nullable(),
  attempts: z.array(AttemptHistoryRowSchema),
});

export type AttemptHistoryRow = z.infer<typeof AttemptHistoryRowSchema>;
export type BlockedReason = z.infer<typeof BlockedReasonSchema>;
export type QuizOverview = z.infer<typeof QuizOverviewSchema>;
