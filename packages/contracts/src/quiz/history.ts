import { z } from '../zod';

/**
 * `GET /api/me/quizzes` — the student's own results, across every quiz.
 *
 * The same "it's already theirs" carve-out `overview.ts` documents applies:
 * scores and pass flags are here because they are the caller's OWN, already
 * finished attempts. Nothing on this shape describes a question, an option or
 * a correct answer, so it is not a `@NoAnswerLeak()` surface at all.
 *
 * Every average and best is `.nullable()` rather than defaulting to 0. A
 * student with no graded attempt has no average, and rendering `٠٪` tells them
 * they scored nothing — the same rule the dashboard's `averageScore` follows.
 */

export const QuizHistoryPointSchema = z.object({
  attemptId: z.string(),
  /** Where the review screen for this attempt lives: `/quizzes/:lessonId/attempt/:attemptId/review`. */
  lessonId: z.string(),
  quizTitle: z.string(),
  attemptNo: z.number().int().min(1),
  scorePercent: z.number().min(0).max(100),
  /** `null` while an essay question on the attempt is still awaiting grading. */
  passed: z.boolean().nullable(),
  submittedAt: z.iso.datetime(),
});

export const QuizHistoryRowSchema = z.object({
  lessonId: z.string(),
  quizTitle: z.string(),
  courseTitle: z.string(),
  courseSlug: z.string(),
  attemptsUsed: z.number().int().min(0),
  /** Whether this quiz is an exam that offers an improvement sitting at all. */
  allowsImprovement: z.boolean(),
  /**
   * Whether the student still HAS that sitting. Both flags are needed: the
   * results row shows «ادخل امتحان التحسين» only when improvement is offered
   * AND unused, and neither fact implies the other.
   */
  improvementUsed: z.boolean(),
  bestPercent: z.number().min(0).max(100).nullable(),
  latestPercent: z.number().min(0).max(100).nullable(),
  /** The attempt the "راجع إجاباتك" link opens: the most recent submitted one. */
  latestAttemptId: z.string(),
  /** Whether the student has passed this quiz, judged on their BEST attempt. */
  passed: z.boolean().nullable(),
  lastSubmittedAt: z.iso.datetime(),
});

export const QuizHistorySummarySchema = z.object({
  /** Distinct quizzes with at least one submitted attempt. */
  quizzesTaken: z.number().int().min(0),
  attemptsTotal: z.number().int().min(0),
  /**
   * Mean over ATTEMPTS, not over quizzes: it answers "how do I score when I
   * sit an exam", so three sittings of one quiz count three times.
   */
  averagePercent: z.number().min(0).max(100).nullable(),
  bestPercent: z.number().min(0).max(100).nullable(),
  /**
   * Counted over QUIZZES, keyed on each one's best attempt — under
   * `gradeMethod: highest` the best sitting is what settles "did I pass this".
   * Counting attempts instead would make a student who passed on the third try
   * look two-thirds failed.
   */
  passedCount: z.number().int().min(0),
});

export const StudentQuizHistorySchema = z.object({
  summary: QuizHistorySummarySchema,
  /** Every submitted attempt, OLDEST FIRST — the chart plots it in order. */
  series: z.array(QuizHistoryPointSchema),
  /** One row per quiz, most recently sat first. */
  quizzes: z.array(QuizHistoryRowSchema),
});

export type QuizHistoryPoint = z.infer<typeof QuizHistoryPointSchema>;
export type QuizHistoryRow = z.infer<typeof QuizHistoryRowSchema>;
export type QuizHistorySummary = z.infer<typeof QuizHistorySummarySchema>;
export type StudentQuizHistory = z.infer<typeof StudentQuizHistorySchema>;
