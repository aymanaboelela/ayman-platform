import { z } from './zod';

/**
 * `GET /api/me/activity` — what the student actually did, newest first.
 *
 * Three kinds merged into one feed:
 *
 *   · `watched`   — one SITTING at a lesson: when, and for how long that time.
 *                   Sourced from `lesson_view_sessions`, which exists because
 *                   `lesson_progress` stores lifetime totals and cannot answer
 *                   a per-occasion question.
 *   · `completed` — a lesson finished, and how (auto / dwell / manual).
 *   · `quiz`      — a quiz submitted, with the score.
 *
 * A discriminated union rather than one wide optional-everything object: a
 * `watched` entry has no score and a `quiz` entry has no watch duration, and
 * modelling that as two nullable fields on one shape means every consumer
 * re-derives which kind it is holding from which fields happen to be set.
 *
 * No relative imports here — same reason as `auth.ts`/`sessions.ts`: this is a
 * leaf module both apps reach through the `@ayman/contracts/activity` subpath
 * without tripping Node's native ESM loader on the root barrel.
 */

export const ACTIVITY_KINDS = ['watched', 'completed', 'quiz'] as const;

/** Mirrors `CompletionSource` in the database. */
export const CompletionViaSchema = z.enum(['auto', 'manual', 'dwell']);

const base = {
  /**
   * Stable within a kind, NOT globally unique across kinds on its own —
   * `kind` is part of the React key at every call site. A completion and a
   * sitting can legitimately share the lesson id they are keyed from.
   */
  id: z.string(),
  /** The cursor is compared against this. */
  occurredAt: z.iso.datetime(),
  lessonId: z.string(),
  lessonTitle: z.string(),
  courseTitle: z.string(),
  courseSlug: z.string(),
};

export const WatchedActivitySchema = z.object({
  ...base,
  kind: z.literal('watched'),
  /** Server-granted seconds only — never a client's claim. */
  secondsWatched: z.number().int().min(0),
});

export const CompletedActivitySchema = z.object({
  ...base,
  kind: z.literal('completed'),
  completedVia: CompletionViaSchema.nullable(),
});

export const QuizActivitySchema = z.object({
  ...base,
  kind: z.literal('quiz'),
  attemptId: z.string(),
  attemptNo: z.number().int().min(1),
  scorePercent: z.number().min(0).max(100),
  /** `null` while an essay answer is still awaiting grading. */
  passed: z.boolean().nullable(),
});

export const ActivityEntrySchema = z.discriminatedUnion('kind', [
  WatchedActivitySchema,
  CompletedActivitySchema,
  QuizActivitySchema,
]);

export const ActivityFeedSchema = z.object({
  entries: z.array(ActivityEntrySchema),
  /**
   * Pass back as `?cursor=` for the next page; `null` means the end.
   *
   * A timestamp cursor rather than an offset. This feed grows at the HEAD —
   * a student watching a lesson while paging through their own history is the
   * normal case — and an offset paginator silently repeats rows every time
   * something is inserted above the window.
   */
  nextCursor: z.string().nullable(),
});

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export type WatchedActivity = z.infer<typeof WatchedActivitySchema>;
export type CompletedActivity = z.infer<typeof CompletedActivitySchema>;
export type QuizActivity = z.infer<typeof QuizActivitySchema>;
export type ActivityEntry = z.infer<typeof ActivityEntrySchema>;
export type ActivityFeed = z.infer<typeof ActivityFeedSchema>;
