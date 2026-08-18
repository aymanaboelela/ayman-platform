import { z } from '@ayman/contracts/zod';

/**
 * The analytics surface — «التحليلات».
 *
 * One vocabulary, three zoom levels, and every level speaks it identically:
 *
 *   overview   the whole platform
 *   lesson     one lesson, every student in it
 *   student    one student, every lesson they touched
 *
 * ## Two rules the whole file depends on
 *
 * **Scores are FRACTIONS (0..1), never percentages, and never raw marks.**
 * A quiz's `gradeOutOf` is per-quiz and editable, so a raw 18 means nothing
 * across two quizzes and a stored "72" is ambiguous about its denominator.
 * Every score on the wire is `scaledScore / gradeOutOf`, and the `%` is put on
 * by the renderer. Same primitive `AdminAttemptRow.score` already uses.
 *
 * **Rates are FRACTIONS of a named denominator.** `watchRate` is watchers over
 * *eligible* students, not over "students who showed up" — a participation
 * number whose denominator is itself participation always reads ~100% and is
 * the single easiest way to make a dashboard lie. `eligible` therefore ships
 * beside every rate so the reader can check the denominator.
 */

// ── grade bands ────────────────────────────────────────────────────────────

/**
 * Five bands on the SCALED fraction, ordered best→worst so `indexOf` is the
 * ordinal rank and the chart ramp can index straight into it.
 *
 * Cut points are the Egyptian report-card conventions (85 / 75 / 65 / 50), NOT
 * the quiz's own `passPercent`: a band chart whose boundaries move per quiz
 * cannot be compared across quizzes, which is the only thing anyone wants it
 * for. Pass/fail — which IS per-quiz — stays its own separate field
 * (`passRate`, from the attempt's own `passed`), so the two never get confused.
 */
export const GRADE_BANDS = ['a', 'b', 'c', 'd', 'f'] as const;
export type GradeBand = (typeof GRADE_BANDS)[number];

/** Inclusive lower bound of each band, as a fraction of the grade. */
export const GRADE_BAND_FLOOR: Record<GradeBand, number> = {
  a: 0.85,
  b: 0.75,
  c: 0.65,
  d: 0.5,
  f: 0,
};

export function gradeBandOf(fraction: number): GradeBand {
  if (fraction >= GRADE_BAND_FLOOR.a) return 'a';
  if (fraction >= GRADE_BAND_FLOOR.b) return 'b';
  if (fraction >= GRADE_BAND_FLOOR.c) return 'c';
  if (fraction >= GRADE_BAND_FLOOR.d) return 'd';
  return 'f';
}

export const GradeBandCountSchema = z.object({
  band: z.enum(GRADE_BANDS),
  n: z.number().int().min(0),
});
export type GradeBandCount = z.infer<typeof GradeBandCountSchema>;

// ── distributions ──────────────────────────────────────────────────────────

/**
 * `bucket` is 1..10 — bucket 1 is [0%, 10%), bucket 10 is [90%, 100%].
 *
 * Same shape and same 1-based indexing as the per-quiz histogram
 * (`AnalyticsService.forQuiz`), so `<ScoreHistogram>` renders either without a
 * translation step. Buckets with no rows are ABSENT, not zero — the renderer
 * fills the gaps; every producer here would otherwise have to remember to.
 */
export const BucketSchema = z.object({
  bucket: z.number().int().min(1).max(10),
  n: z.number().int().min(0),
});
export type Bucket = z.infer<typeof BucketSchema>;

/** Time-on-task, in named buckets rather than deciles — the interesting shape
 *  is at the short end (rushed) and the long end (stuck), and a linear ten-way
 *  split of a distribution with a long tail puts everything in bucket 1. */
export const DURATION_BUCKETS_SECONDS = [60, 180, 300, 600, 900, 1800, 3600] as const;

export const DurationBucketSchema = z.object({
  /** Exclusive upper bound in seconds; `null` is the overflow bucket. */
  upperSeconds: z.number().int().positive().nullable(),
  n: z.number().int().min(0),
});
export type DurationBucket = z.infer<typeof DurationBucketSchema>;

// ── overview ───────────────────────────────────────────────────────────────

/** How a student engaged, as four mutually exclusive states. Mutually
 *  exclusive is the point: the four add up to `eligible`, so the donut is a
 *  real part-to-whole and not four overlapping percentages. */
export const ENGAGEMENT_SEGMENTS = ['both', 'videoOnly', 'quizOnly', 'neither'] as const;
export type EngagementSegment = (typeof ENGAGEMENT_SEGMENTS)[number];

export const EngagementSliceSchema = z.object({
  segment: z.enum(ENGAGEMENT_SEGMENTS),
  n: z.number().int().min(0),
});
export type EngagementSlice = z.infer<typeof EngagementSliceSchema>;

export const DailyPointSchema = z.object({
  /** `YYYY-MM-DD`, in Africa/Cairo. Every day in the window is present, zeros
   *  included — a line chart that skips empty days draws a slope through the
   *  gap and invents activity that did not happen. */
  date: z.string(),
  watchMinutes: z.number().min(0),
  attempts: z.number().int().min(0),
  activeStudents: z.number().int().min(0),
});
export type DailyPoint = z.infer<typeof DailyPointSchema>;

export const YearBreakdownSchema = z.object({
  year: z.number().int(),
  students: z.number().int().min(0),
  avgCompletion: z.number().min(0).max(1).nullable(),
  meanScore: z.number().min(0).max(1).nullable(),
});
export type YearBreakdown = z.infer<typeof YearBreakdownSchema>;

export const GovernorateBreakdownSchema = z.object({
  code: z.string(),
  nameAr: z.string(),
  students: z.number().int().min(0),
  meanScore: z.number().min(0).max(1).nullable(),
});
export type GovernorateBreakdown = z.infer<typeof GovernorateBreakdownSchema>;

export const AnalyticsOverviewSchema = z.object({
  students: z.object({
    /**
     * Every student, enrolled or not — the same population `/admin/students`
     * and `/admin/analytics/students` list, because the tile that shows this
     * number is a LINK to them.
     *
     * It used to require an active enrollment, which made it the smallest of
     * three different «الطلبة» on one screen and smaller than the roster it
     * opened. Narrowed to a course by `courseId`, and only then.
     */
    total: z.number().int().min(0),
    /**
     * …of whom this many hold an active enrollment. The denominator every rate
     * below divides by (`video.eligible` is this same integer), stated in the
     * headline row so the reader can see the population a rate is about.
     *
     * Replaces `onboarded`, which divided onboarded-students by
     * enrolled-students and could therefore only ever read 100%: enrolling is
     * impossible before onboarding finishes.
     */
    enrolled: z.number().int().min(0),
    activeLast7: z.number().int().min(0),
    activeLast30: z.number().int().min(0),
    newLast30: z.number().int().min(0),
  }),
  video: z.object({
    /** Students with at least one second watched anywhere. */
    watchers: z.number().int().min(0),
    /** Students with an active enrollment — the denominator of `watchRate`. */
    eligible: z.number().int().min(0),
    watchRate: z.number().min(0).max(1).nullable(),
    watchHours: z.number().min(0),
    lessonsOpened: z.number().int().min(0),
    lessonsCompleted: z.number().int().min(0),
    /** Mean of `lesson_progress.completion` over OPENED lessons only. */
    avgCompletion: z.number().min(0).max(1).nullable(),
  }),
  quiz: z.object({
    quizzes: z.number().int().min(0),
    attempts: z.number().int().min(0),
    participants: z.number().int().min(0),
    participationRate: z.number().min(0).max(1).nullable(),
    meanScore: z.number().min(0).max(1).nullable(),
    medianScore: z.number().min(0).max(1).nullable(),
    passRate: z.number().min(0).max(1).nullable(),
    meanDurationSeconds: z.number().min(0).nullable(),
    medianDurationSeconds: z.number().min(0).nullable(),
  }),
  scoreBuckets: z.array(BucketSchema),
  gradeBands: z.array(GradeBandCountSchema),
  durationBuckets: z.array(DurationBucketSchema),
  completionBuckets: z.array(BucketSchema),
  engagement: z.array(EngagementSliceSchema),
  daily: z.array(DailyPointSchema),
  byYear: z.array(YearBreakdownSchema),
  byGovernorate: z.array(GovernorateBreakdownSchema),
});
export type AnalyticsOverview = z.infer<typeof AnalyticsOverviewSchema>;

// ── per lesson ─────────────────────────────────────────────────────────────

export const LessonAnalyticsRowSchema = z.object({
  lessonId: z.string(),
  title: z.string(),
  courseId: z.string(),
  courseTitle: z.string(),
  sectionTitle: z.string(),
  position: z.number().int(),
  kind: z.string(),
  hasVideo: z.boolean(),
  videoDurationSeconds: z.number().int().min(0).nullable(),

  eligible: z.number().int().min(0),
  opened: z.number().int().min(0),
  openRate: z.number().min(0).max(1).nullable(),
  completed: z.number().int().min(0),
  completionRate: z.number().min(0).max(1).nullable(),
  avgCompletion: z.number().min(0).max(1).nullable(),
  watchHours: z.number().min(0),
  avgWatchSeconds: z.number().min(0).nullable(),

  quizId: z.string().nullable(),
  quizTitle: z.string().nullable(),
  quizAttempts: z.number().int().min(0),
  quizParticipants: z.number().int().min(0),
  quizParticipationRate: z.number().min(0).max(1).nullable(),
  quizMeanScore: z.number().min(0).max(1).nullable(),
  quizMedianScore: z.number().min(0).max(1).nullable(),
  quizPassRate: z.number().min(0).max(1).nullable(),
  quizMedianDurationSeconds: z.number().min(0).nullable(),
});
export type LessonAnalyticsRow = z.infer<typeof LessonAnalyticsRowSchema>;

/** One student's row inside a lesson deep-dive. Nulls are load-bearing:
 *  `bestScore: null` with `attempts: 0` means "never sat it", which is a
 *  different fact from a zero and must not render as one. */
export const LessonStudentRowSchema = z.object({
  userId: z.string(),
  fullName: z.string(),
  year: z.number().int().nullable(),
  governorateNameAr: z.string().nullable(),
  watchedSeconds: z.number().int().min(0),
  completion: z.number().min(0).max(1),
  state: z.string(),
  openCount: z.number().int().min(0),
  lastSeenAt: z.string().nullable(),
  attempts: z.number().int().min(0),
  bestScore: z.number().min(0).max(1).nullable(),
  lastScore: z.number().min(0).max(1).nullable(),
  passed: z.boolean().nullable(),
  quizSeconds: z.number().int().min(0).nullable(),
});
export type LessonStudentRow = z.infer<typeof LessonStudentRowSchema>;

export const LessonAnalyticsDetailSchema = z.object({
  summary: LessonAnalyticsRowSchema,
  completionBuckets: z.array(BucketSchema),
  scoreBuckets: z.array(BucketSchema),
  gradeBands: z.array(GradeBandCountSchema),
  durationBuckets: z.array(DurationBucketSchema),
  engagement: z.array(EngagementSliceSchema),
  students: z.array(LessonStudentRowSchema),
});
export type LessonAnalyticsDetail = z.infer<typeof LessonAnalyticsDetailSchema>;

// ── per student ────────────────────────────────────────────────────────────

export const StudentAnalyticsRowSchema = z.object({
  userId: z.string(),
  fullName: z.string(),
  year: z.number().int().nullable(),
  governorateNameAr: z.string().nullable(),
  enrollments: z.number().int().min(0),
  lessonsOpened: z.number().int().min(0),
  lessonsCompleted: z.number().int().min(0),
  avgCompletion: z.number().min(0).max(1).nullable(),
  watchHours: z.number().min(0),
  quizzesTaken: z.number().int().min(0),
  attempts: z.number().int().min(0),
  meanScore: z.number().min(0).max(1).nullable(),
  bestScore: z.number().min(0).max(1).nullable(),
  passRate: z.number().min(0).max(1).nullable(),
  medianQuizSeconds: z.number().min(0).nullable(),
  lastActiveAt: z.string().nullable(),
});
export type StudentAnalyticsRow = z.infer<typeof StudentAnalyticsRowSchema>;

export const STUDENT_ANALYTICS_SORTS = [
  'fullName',
  'lessonsCompleted',
  'watchHours',
  'avgCompletion',
  'attempts',
  'meanScore',
  'passRate',
  'lastActiveAt',
] as const;
export type StudentAnalyticsSort = (typeof STUDENT_ANALYTICS_SORTS)[number];

export const StudentCourseRowSchema = z.object({
  courseId: z.string(),
  title: z.string(),
  lessons: z.number().int().min(0),
  opened: z.number().int().min(0),
  completed: z.number().int().min(0),
  avgCompletion: z.number().min(0).max(1).nullable(),
  watchHours: z.number().min(0),
});
export type StudentCourseRow = z.infer<typeof StudentCourseRowSchema>;

export const StudentAttemptRowSchema = z.object({
  attemptId: z.string(),
  quizId: z.string(),
  quizTitle: z.string(),
  lessonTitle: z.string().nullable(),
  attemptNo: z.number().int().min(1),
  state: z.string(),
  score: z.number().min(0).max(1).nullable(),
  passed: z.boolean().nullable(),
  seconds: z.number().int().min(0).nullable(),
  submittedAt: z.string().nullable(),
});
export type StudentAttemptRow = z.infer<typeof StudentAttemptRowSchema>;

/**
 * One LESSON on this student's record — the row behind «شاف إيه، وقعد قد إيه».
 *
 * `courses[]` above stops at the rollup («٤ من ١٢ خلصوا»), which is the wrong
 * altitude for the question an admin actually opens a student to ask: WHICH
 * four, and how long did each take. That cannot be derived from the rollup, so
 * it is its own list.
 *
 * `lastSeenAt` is `lesson_progress.last_heartbeat_at` — the last moment the
 * player reported this lesson open — and NOT `updatedAt`, which any unrelated
 * write rewrites.
 */
export const StudentLessonRowSchema = z.object({
  lessonId: z.string(),
  lessonTitle: z.string(),
  courseId: z.string(),
  courseTitle: z.string(),
  /** Mirrors `LessonProgressState`; a plain string so a new state added to the
   *  database enum cannot 500 this endpoint before the UI has a label for it. */
  state: z.string(),
  completion: z.number().min(0).max(1).nullable(),
  watchedSeconds: z.number().int().min(0),
  /** How many separate times they opened it. `1` and `9` are different stories
   *  about the same completion percentage. */
  openCount: z.number().int().min(0),
  lastSeenAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  /** `auto` | `manual` | `dwell`, or null when not completed. */
  completedVia: z.string().nullable(),
});
export type StudentLessonRow = z.infer<typeof StudentLessonRowSchema>;

/**
 * The device rows are ACCOUNT-level, and the wording on screen has to stay
 * inside what they can support.
 *
 * `session_devices` records one row per LOGIN, classified from the user agent
 * that login arrived with. Nothing joins it to `lesson_view_sessions` or
 * `quiz_attempts` — neither table carries a session id, a user agent or an IP —
 * so this block answers «بيدخل من أنهي أجهزة» and can never answer «شاف الدرس
 * ده من الموبايل». Do not let a label imply the second.
 *
 * No `ip` field, deliberately: the column holds Better Auth's own value,
 * resolved from `x-forwarded-for` alone and IPv6-masked to a /64, which is a
 * third and weaker notion of client address than either the rate limiter's or
 * the audit log's. Showing it would invite a decision to be made on it.
 */
export const StudentDeviceRowSchema = z.object({
  id: z.string(),
  /** Composed server-side, e.g. «Chrome على macOS». */
  deviceName: z.string(),
  /** `desktop` | `mobile` | `tablet` | `unknown` — a coarse form-factor guess
   *  from the user agent, not a declared platform. String, not an enum: the
   *  database column is a plain `String` and the UI needs a default branch. */
  deviceType: z.string(),
  loggedInAt: z.string(),
  /**
   * The session's own `updatedAt` — genuinely rolling — and null once the
   * session row is gone. NOT `session_devices.last_seen_at`, which is written
   * once at insert and never updated, and so would render as a "last activity"
   * that is always identical to the login.
   */
  lastActiveAt: z.string().nullable(),
  revoked: z.boolean(),
});
export type StudentDeviceRow = z.infer<typeof StudentDeviceRowSchema>;

/**
 * One row per device TYPE, counted over the student's whole history.
 *
 * Two different counts, because they answer two different questions and a
 * single number cannot be both. `session_devices` holds one row per SIGN-IN,
 * so a student who opens the app on the same phone every morning for a term
 * has ~90 rows and one device.
 *
 *   · `logins`  — how often they come in on this kind of hardware. This is
 *                 the honest weight behind «بيذاكر من الموبايل».
 *   · `devices` — how many distinct machines of this kind, by device name.
 */
export const StudentDeviceTypeSchema = z.object({
  type: z.string(),
  logins: z.number().int().min(0),
  devices: z.number().int().min(0),
});
export type StudentDeviceType = z.infer<typeof StudentDeviceTypeSchema>;

export const StudentDevicesSchema = z.object({
  /** Sign-ins on record, all of them — NOT the length of `recent`. */
  logins: z.number().int().min(0),
  /** Distinct device names across every sign-in. */
  distinctDevices: z.number().int().min(0),
  byType: z.array(StudentDeviceTypeSchema),
  lastLoginAt: z.string().nullable(),
  /**
   * The most recent sign-ins only, newest first — a bounded window over a list
   * that grows with every login. The totals above are computed over the whole
   * history precisely so this cap can never understate it.
   */
  recent: z.array(StudentDeviceRowSchema),
  /**
   * Banning a student DELETES their device rows (`StudentsService.ban`), and
   * unbanning never restores them. Without this flag an empty list would read
   * as «عمره ما دخل», which is the opposite of what happened.
   */
  clearedByBan: z.boolean(),
});
export type StudentDevices = z.infer<typeof StudentDevicesSchema>;

export const StudentAnalyticsDetailSchema = z.object({
  summary: StudentAnalyticsRowSchema,
  /** The cohort's mean on the same measures, so every number on the screen has
   *  something to be compared against. A lone «٦٨٪» answers nothing. */
  cohort: z.object({
    avgCompletion: z.number().min(0).max(1).nullable(),
    meanScore: z.number().min(0).max(1).nullable(),
    passRate: z.number().min(0).max(1).nullable(),
    medianQuizSeconds: z.number().min(0).nullable(),
  }),
  courses: z.array(StudentCourseRowSchema),
  /** Every lesson they have ever opened, most recently touched first. */
  lessons: z.array(StudentLessonRowSchema),
  attempts: z.array(StudentAttemptRowSchema),
  devices: StudentDevicesSchema,
  scoreBuckets: z.array(BucketSchema),
  gradeBands: z.array(GradeBandCountSchema),
  daily: z.array(DailyPointSchema),
});
export type StudentAnalyticsDetail = z.infer<typeof StudentAnalyticsDetailSchema>;
