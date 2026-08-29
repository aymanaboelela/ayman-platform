import { z } from '@ayman/contracts/zod';

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

/**
 * How long a gap between heartbeats ends a viewing SITTING.
 *
 * `lesson_view_sessions` records one row per sitting, and this is the rule
 * that decides where one ends and the next begins: a heartbeat inside the gap
 * extends the open row, one outside it starts a new one.
 *
 * 30 minutes, chosen against what the two failure modes cost. Too short and a
 * student who pauses to make tea has their evening split into four entries
 * that each claim a separate start time. Too long and a morning and an evening
 * session merge into one row claiming they watched from 09:00 to 21:00 — which
 * is the worse error, because the timeline's whole promise is "when", and a
 * twelve-hour sitting is a visibly false statement rather than a slightly
 * fragmented true one.
 *
 * It lives here rather than in `apps/api` for the same reason the completion
 * thresholds do: one tested constant, shared by the server that enforces it
 * and by any client that wants to explain it.
 */
export const VIEW_SESSION_GAP_SECONDS = 30 * 60;

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

/** Same rule, same reason: a local unexported copy of `./content`'s
 *  `LessonResourceKindSchema`. Importing it here would be the exact relative
 *  value-import the comment above forbids. The two are kept in step by
 *  `progress.spec.ts`, which asserts the member lists are identical — a drift
 *  between them fails a test rather than a production request. */
const lessonResourceKindSchema = z.enum(['presentation', 'video', 'document', 'link']);

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

/**
 * `POST /api/courses/:courseId/enroll`, as the course page's single
 * "نبدأ الكورس" button reads it.
 *
 * Only the two fields that button needs are declared: Zod strips the rest, so
 * the route's `access` object (an internal denial-reason union) never has to be
 * mirrored on the client. `resumeLessonId` is `null` only for a published
 * course with no published lessons — the button renders disabled rather than
 * navigating to a lesson that does not exist.
 */
export const EnrollResponseSchema = z.object({
  enrollmentId: z.string(),
  resumeLessonId: z.string().nullable(),
});

/* ── the player payloads ─────────────────────────────────────────────── */

/**
 * Server-computed, never inferred by the client. `state` is what the student
 * DID; `gate` is what they may do next — two different questions that a single
 * enum would conflate (a `failed` lesson is not cleared, but it is still
 * available to retry).
 */
export const GateStateSchema = z.enum(['cleared', 'available', 'locked']);
export type GateState = z.infer<typeof GateStateSchema>;

export const OutlineLessonSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: lessonKindSchema,
  position: z.number().int(),
  estimatedSeconds: z.number().int().nullable(),
  isFreePreview: z.boolean(),
  state: LessonProgressStateSchema,
  completion: z.number().min(0).max(1),
  /** The lock the UI draws. Cosmetic — the routes re-derive it per request. */
  gate: GateStateSchema,
  /** True for the course's final exam, which unlocks only when all else clears. */
  isExam: z.boolean(),
});

export const OutlineSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  position: z.number().int(),
  lessons: z.array(OutlineLessonSchema),
});

export const CourseOutlineSchema = z.object({
  course: z.object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    /**
     * الكتاب الورقي — same pair `EnrolledCourse` carries, `null` when this
     * course has no printed textbook to order. Lets `CourseOutlineSidebar`
     * offer its own «اطلب الكتاب» link while a student is actually watching
     * a lesson — arguably the moment they are most "inside" the course.
     */
    bookTitle: z.string().nullable(),
    bookPriceCents: z.number().int().nullable(),
  }),
  sections: z.array(OutlineSectionSchema),
  enrollmentId: z.string(),
  progressPercent: z.number().min(0).max(100),
  lastLessonId: z.string().nullable(),
  completedLessons: z.number().int().min(0),
  totalLessons: z.number().int().min(0),
  /**
   * Null when the course has no exam. The one lesson the outline may draw a
   * lock on — see `resolveGate`, which no longer gates anything else.
   */
  examLessonId: z.string().nullable(),
});

export const PlayerResourceSchema = z.object({
  id: z.string(),
  kind: lessonResourceKindSchema,
  title: z.string(),
  description: z.string().nullable(),

  /** File resources (`presentation`, `document`) only. */
  filename: z.string().nullable(),
  mime: z.string().nullable(),
  sizeBytes: z.number().int().min(0).nullable(),

  /** Video resources only. The 11-char id — the embed URL is rebuilt client-side. */
  youtubeId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{11}$/)
    .nullable(),

  /** Link resources only. Always https — enforced at the DTO and by a CHECK. */
  linkUrl: z.string().startsWith('https://').nullable(),

  /**
   * Same-origin paths on OUR api, never a storage URL: `/media/*` is `@Public()`
   * and can never carry content gated on enrollment, so these routes re-derive
   * access per request before streaming a byte. A leaked storage key is not by
   * itself an access grant.
   *
   * Null for `video` and `link`, which have no bytes of ours to serve.
   */
  viewPath: z.string().startsWith('/api/').nullable(),
  downloadPath: z.string().startsWith('/api/').nullable(),
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
  /**
   * A quiz attached to THIS lesson, published and ready to sit — regardless of
   * `lesson.kind`. `Quiz.lessonId` is 1:1 with any lesson kind, so a video
   * lecture can carry a short bonus quiz alongside its own completion rule.
   * Null when no quiz exists yet, or when one exists but is still a draft.
   */
  quiz: z.object({ id: z.string() }).nullable(),
  resources: z.array(PlayerResourceSchema),
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
  /**
   * The storage KEY, never a URL — the same rule `media_assets` and
   * `Course.coverKey` follow. The client turns it into one with `mediaUrl()`.
   *
   * The dashboard used to render its course cards as text on a flat panel
   * while the library, one click away, showed the same courses with their
   * cover art. Same courses, two different products.
   */
  coverKey: z.string().nullable(),
  /** Labels the coverless fallback, exactly as the library card does. */
  subjectNameAr: z.string(),
  /**
   * Is the course still published?
   *
   * `false` means the instructor has taken it down to edit it while this
   * student is enrolled. The dashboard used to drop such a course from the
   * payload entirely (`course: { status: 'published' }` in the `where`), which
   * made it disappear off «كورساتي» and out of the rail with no word — and
   * `/path`, which had no filter at all, went on offering it as a run of links
   * that every one 404'd. Two screens, two different wrong answers about the
   * same course.
   *
   * Both say «مقفول مؤقتاً» now, which is the same answer `PathCourseSchema`
   * gives and for the same reason: losing the thing AND the explanation is
   * worse than losing access to it for ten minutes.
   *
   * ⚠️ NOT an access decision — `LessonAccessService` re-derives the refusal on
   * every request. This only lets a screen explain one.
   */
  published: z.boolean(),
  progressPercent: z.number().min(0).max(100),
  completedLessons: z.number().int().min(0),
  totalLessons: z.number().int().min(0),
  /**
   * Where «نكمّل» resumes. Always `null` while the course is closed: it is
   * what `enrolledCourseHref` builds its link from, so leaving it set would
   * keep a resume button pointing into a lesson the routes refuse.
   */
  lastLessonId: z.string().nullable(),
  /**
   * When the student's paid subscription to THIS course runs out — the same
   * `purchase` `AccessGrant.validUntil` the admin finance screen reads.
   * `null` for a free course, an admin-granted one, or any course this
   * student was never charged for; a course closed under `requiresGrant`
   * with no grant at all is a different failure the player already reports.
   */
  subscriptionValidUntil: z.iso.datetime().nullable(),
  /**
   * The admin's «لسه هننزل قريبًا» wording for this course — same field the
   * public course page reads, `null` when unset. Only meaningful while
   * `totalLessons` is `0`; see `isComingSoon` in `catalog.ts`.
   */
  comingSoonNote: z.string().nullable(),
  /**
   * الكتاب الورقي — same pair `CatalogCourseSchema` carries, `null` when this
   * course has no printed textbook to order. Lets `EnrolledCourseCard` show
   * an «اطلب الكتاب» CTA of its own for a student who is already enrolled —
   * `BookOrderButton` used to be reachable only from the public course page,
   * which a returning student has no reason to visit again once enrolled.
   */
  bookTitle: z.string().nullable(),
  bookPriceCents: z.number().int().nullable(),
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
export type EnrollResponse = z.infer<typeof EnrollResponseSchema>;
export type OutlineLesson = z.infer<typeof OutlineLessonSchema>;
export type OutlineSection = z.infer<typeof OutlineSectionSchema>;
export type CourseOutline = z.infer<typeof CourseOutlineSchema>;
export type PlayerResource = z.infer<typeof PlayerResourceSchema>;
export type PlayerVideo = z.infer<typeof PlayerVideoSchema>;
export type LessonNeighbour = z.infer<typeof LessonNeighbourSchema>;
export type LessonPlayer = z.infer<typeof LessonPlayerSchema>;
export type ContinueWatching = z.infer<typeof ContinueWatchingSchema>;
export type RecentScore = z.infer<typeof RecentScoreSchema>;
export type EnrolledCourse = z.infer<typeof EnrolledCourseSchema>;
export type Dashboard = z.infer<typeof DashboardSchema>;
