import { z } from 'zod';

/* ────────────────────────────────────────────────────────────────────────
 * The completion rule.
 *
 * Auto-completion requires BOTH thresholds. Either one alone is trivially
 * defeated:
 *   • position only  → drag the scrubber to the end (Open edX's
 *     COMPLETION_VIDEO_COMPLETE_PERCENTAGE = 0.95 has exactly this hole)
 *   • watch-time only → leave the tab playing in the background and never
 *     look at it
 * Requiring both means the student must have reached the end AND spent most
 * of the runtime getting there.
 * ──────────────────────────────────────────────────────────────────────── */

export const VIDEO_POSITION_THRESHOLD = 0.95;
export const VIDEO_WATCHED_THRESHOLD = 0.7;

/** The client posts one heartbeat per 10s of playback. */
export const HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * Hard cap on what a single heartbeat may claim. 15 > 10 so a throttled
 * background tab can still report one late tick — and no more than one.
 */
export const MAX_HEARTBEAT_DELTA_SECONDS = 15;

/**
 * Slack added to the server-measured gap between heartbeats, absorbing
 * scheduling jitter and network latency. Deliberately tiny: it is the only
 * thing a flooder can actually harvest, and 15 requests/min × 2s = 30s is
 * strictly worse than the 60s an honest minute of playback yields.
 */
export const HEARTBEAT_CLOCK_GRACE_SECONDS = 2;

/** Text and attachment lessons complete after this much dwell on the page. */
export const DWELL_COMPLETE_MS = 5_000;

export interface VideoProgressSnapshot {
  durationSeconds: number;
  maxPositionSeconds: number;
  watchedSeconds: number;
}

/**
 * The authority. Called by the server on every heartbeat; the client may call
 * it only to mirror the expected outcome, and must reconcile to whatever the
 * server actually returned.
 */
export function isVideoAutoComplete(snapshot: VideoProgressSnapshot): boolean {
  // An unknown duration makes every ratio meaningless — and would make the
  // thresholds trivially satisfiable at 0. Such a lesson can only be finished
  // with the manual button.
  if (snapshot.durationSeconds <= 0) return false;

  const positionOk =
    snapshot.maxPositionSeconds >= VIDEO_POSITION_THRESHOLD * snapshot.durationSeconds;
  const watchedOk = snapshot.watchedSeconds >= VIDEO_WATCHED_THRESHOLD * snapshot.durationSeconds;

  return positionOk && watchedOk;
}

/**
 * 0..1 with at most 4 decimals, matching the `numeric(5,4)` column exactly so
 * what we write is what Postgres stores — no silent rounding surprises when
 * the value is read back and compared.
 */
export function videoCompletionFraction(snapshot: VideoProgressSnapshot): number {
  if (snapshot.durationSeconds <= 0) return 0;
  if (isVideoAutoComplete(snapshot)) return 1;

  const raw = snapshot.watchedSeconds / snapshot.durationSeconds;
  const clamped = Math.min(Math.max(raw, 0), 1);
  return Math.round(clamped * 10_000) / 10_000;
}

/**
 * How many seconds a heartbeat is allowed to add, given how much wall-clock
 * time the SERVER measured since the previous heartbeat on this row.
 *
 * This is what makes "the server accumulates" true rather than aspirational:
 * ten heartbeats fired inside the same second buy ten grace windows, not ten
 * deltas, and no sequence of requests can ever accumulate watch time faster
 * than time itself passes.
 */
export function allowedHeartbeatSeconds(claimedDelta: number, elapsedSeconds: number): number {
  const claimed = Math.min(Math.max(Math.floor(claimedDelta), 0), MAX_HEARTBEAT_DELTA_SECONDS);
  const wallClock = Math.max(Math.floor(elapsedSeconds), 0) + HEARTBEAT_CLOCK_GRACE_SECONDS;
  return Math.min(claimed, wallClock);
}

/* ────────────────────────────────────────────────────────────────────────
 * Wire contracts. One schema, two consumers: NestJS validates requests with
 * it through `createZodDto`, and `apiGet`/`apiPost` parse responses with it.
 * ──────────────────────────────────────────────────────────────────────── */

// `LessonKind`/`LessonKindSchema` are Plan 3's, declared and exported from
// `./content`. This module needs the same enum shape to build outline/player
// schemas but deliberately does NOT import `./content` (a relative import
// inside a contracts leaf module that apps/api imports as a value breaks
// Node's native ESM loader at real runtime — see `onboarding.dto.ts`'s
// comment for the full reasoning) and deliberately does NOT `export` this
// local copy (an unexported binding of the same name cannot collide with
// `./content`'s exported one when both flow through the root barrel).
const lessonKindSchema = z.enum(['video', 'quiz', 'attachment', 'text']);

export const LessonProgressStateSchema = z.enum([
  'not_started',
  'in_progress',
  'completed',
  'passed',
  'failed',
]);

/**
 * How a lesson came to be complete. `auto` earned both video thresholds,
 * `dwell` sat on a text/attachment lesson for 5s, `manual` pressed the
 * button. Keeping them apart is the only way to answer "is our content
 * actually being watched?" — a single boolean would blend the three forever.
 */
export const CompletionSourceSchema = z.enum(['auto', 'manual', 'dwell']);

export const LessonProgressSchema = z.object({
  lessonId: z.string(),
  state: LessonProgressStateSchema,
  completion: z.number().min(0).max(1),
  watchedSeconds: z.number().int().min(0),
  maxPositionSeconds: z.number().int().min(0),
  openCount: z.number().int().min(0),
  completedAt: z.iso.datetime().nullable(),
  completedVia: CompletionSourceSchema.nullable(),
});

/**
 * `.strict()` so `{ completed: true }`, `{ completion: 1 }` or `{ score: 100 }`
 * are 400s, not silently-stripped fields (Global Constraint 8). `delta` is
 * capped at the schema level too — the wall-clock clamp in the service is the
 * real control, this is just the cheapest possible rejection.
 */
export const HeartbeatRequestSchema = z
  .object({
    position: z.number().int().min(0).max(86_400),
    delta: z.number().int().min(0).max(MAX_HEARTBEAT_DELTA_SECONDS),
  })
  .strict();

/** Deliberately empty and strict: the manual button carries no payload. */
export const EmptyBodySchema = z.object({}).strict();

export const HeartbeatResponseSchema = z.object({
  progress: LessonProgressSchema,
  /** Server-decided, this request only. The client mirrors it; it never computes it. */
  justCompleted: z.boolean(),
  courseProgressPercent: z.number().min(0).max(100),
});

export const EnrollmentSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  courseSlug: z.string(),
  // RECONCILED: must match Plan 3's canonical EnrollmentStatus exactly.
  status: z.enum(['active', 'suspended', 'expired', 'revoked', 'completed']),
  progressPercent: z.number().min(0).max(100),
  lastLessonId: z.string().nullable(),
  enrolledAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});

/* ── the player payloads ─────────────────────────────────────────────── */

export const OutlineLessonSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: lessonKindSchema,
  position: z.number().int(),
  estimatedSeconds: z.number().int().nullable(),
  isFreePreview: z.boolean(),
  state: LessonProgressStateSchema,
  completion: z.number().min(0).max(1),
});

export const OutlineSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  position: z.number().int(),
  lessons: z.array(OutlineLessonSchema),
});

export const CourseOutlineSchema = z.object({
  course: z.object({ id: z.string(), slug: z.string(), title: z.string() }),
  sections: z.array(OutlineSectionSchema),
  enrollmentId: z.string(),
  progressPercent: z.number().min(0).max(100),
  lastLessonId: z.string().nullable(),
  completedLessons: z.number().int().min(0),
  totalLessons: z.number().int().min(0),
});

export const PlayerAttachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mime: z.string(),
  sizeBytes: z.number().int().min(0),
  /**
   * Always a same-origin path on OUR api, never a storage URL. The download
   * route re-checks enrollment before redirecting, so a leaked storage key is
   * not by itself an access grant.
   */
  downloadPath: z.string().startsWith('/api/'),
});

export const PlayerVideoSchema = z.object({
  /** The 11-char id only — spec §7 P3. A URL here would reintroduce the SSRF class. */
  youtubeId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  durationSeconds: z.number().int().min(0),
  posterUrl: z.string().nullable(),
});

export const LessonNeighbourSchema = z
  .object({ id: z.string(), title: z.string(), kind: lessonKindSchema })
  .nullable();

export const LessonPlayerSchema = z.object({
  lesson: z.object({
    id: z.string(),
    courseId: z.string(),
    courseSlug: z.string(),
    courseTitle: z.string(),
    sectionTitle: z.string(),
    title: z.string(),
    kind: lessonKindSchema,
    estimatedSeconds: z.number().int().nullable(),
  }),
  video: PlayerVideoSchema.nullable(),
  text: z.object({ bodyHtml: z.string() }).nullable(),
  attachments: z.array(PlayerAttachmentSchema),
  progress: LessonProgressSchema,
  previous: LessonNeighbourSchema,
  next: LessonNeighbourSchema,
  /** False when the duration is unknown — the manual button is then the only path. */
  autoCompleteAvailable: z.boolean(),
});

/* ── the dashboard ───────────────────────────────────────────────────── */

export const ContinueWatchingSchema = z.object({
  courseId: z.string(),
  courseSlug: z.string(),
  courseTitle: z.string(),
  lessonId: z.string(),
  lessonTitle: z.string(),
  lessonKind: lessonKindSchema,
  progressPercent: z.number().min(0).max(100),
  /** 0 when the lesson is not a video or its duration is unknown. */
  remainingSeconds: z.number().int().min(0),
});

export const RecentScoreSchema = z.object({
  attemptId: z.string(),
  quizTitle: z.string(),
  courseSlug: z.string(),
  scorePercent: z.number().min(0).max(100),
  submittedAt: z.iso.datetime(),
});

export const EnrolledCourseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  progressPercent: z.number().min(0).max(100),
  completedLessons: z.number().int().min(0),
  totalLessons: z.number().int().min(0),
  lastLessonId: z.string().nullable(),
});

export const DashboardSchema = z.object({
  continueWatching: ContinueWatchingSchema.nullable(),
  enrolledCourses: z.array(EnrolledCourseSchema),
  recentScores: z.array(RecentScoreSchema),
});

export type LessonProgressState = z.infer<typeof LessonProgressStateSchema>;
export type CompletionSource = z.infer<typeof CompletionSourceSchema>;
export type LessonProgressDto = z.infer<typeof LessonProgressSchema>;
export type HeartbeatRequest = z.infer<typeof HeartbeatRequestSchema>;
export type HeartbeatResponse = z.infer<typeof HeartbeatResponseSchema>;
export type EnrollmentDto = z.infer<typeof EnrollmentSchema>;
export type OutlineLesson = z.infer<typeof OutlineLessonSchema>;
export type OutlineSection = z.infer<typeof OutlineSectionSchema>;
export type CourseOutline = z.infer<typeof CourseOutlineSchema>;
export type PlayerAttachment = z.infer<typeof PlayerAttachmentSchema>;
export type PlayerVideo = z.infer<typeof PlayerVideoSchema>;
export type LessonNeighbour = z.infer<typeof LessonNeighbourSchema>;
export type LessonPlayer = z.infer<typeof LessonPlayerSchema>;
export type ContinueWatching = z.infer<typeof ContinueWatchingSchema>;
export type RecentScore = z.infer<typeof RecentScoreSchema>;
export type EnrolledCourse = z.infer<typeof EnrolledCourseSchema>;
export type Dashboard = z.infer<typeof DashboardSchema>;
