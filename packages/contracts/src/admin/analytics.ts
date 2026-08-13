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
    total: z.number().int().min(0),
    onboarded: z.number().int().min(0),
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
  attempts: z.array(StudentAttemptRowSchema),
  scoreBuckets: z.array(BucketSchema),
  gradeBands: z.array(GradeBandCountSchema),
  daily: z.array(DailyPointSchema),
});
export type StudentAnalyticsDetail = z.infer<typeof StudentAnalyticsDetailSchema>;
