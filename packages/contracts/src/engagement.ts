import { z } from '@ayman/contracts/zod';
import { BacklogItemSchema } from '@ayman/contracts/backlog';

/**
 * Student engagement — five features that answer «what makes a student open
 * the platform tomorrow»:
 *
 *   · «سؤال اليوم»     one question a day, and the streak of days answered.
 *   · «ملاحظاتي»       notes on a lesson, pinned to a second of its video.
 *   · «خطة المذاكرة»   an exam date, and the backlog spread over the days left.
 *   · «أوسمتي»         tiered badges over everything a student does here.
 *   · «ملخص الشهر»     the month in numbers, as a story-size image to share.
 *
 * Each is its own entitlement (`admin/entitlements.ts`): on for Ayman, off for
 * every other teacher until the owner opens it from `/admin/platforms`.
 *
 * ## Days are Cairo days
 *
 * Every `day`/`date` below is `YYYY-MM-DD` on the Africa/Cairo calendar. A
 * student who answers at 00:30 has answered the NEW day, and a streak is a run
 * of Cairo dates. The helpers at the bottom do date arithmetic on those keys
 * as UTC midnights, which is exact for whole days and never sees a DST jump.
 */

export const DayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type DayKey = z.infer<typeof DayKeySchema>;

export const MonthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

// ─── «سؤال اليوم» ──────────────────────────────────────────────────────────

export const DailyQuestionSchema = z.object({
  questionVersionId: z.uuid(),
  type: z.enum(['mcq_single', 'true_false']),
  stemHtml: z.string(),
  options: z.array(z.object({ id: z.uuid(), bodyHtml: z.string() })).min(2),
  courseTitle: z.string(),
  /** The lecture the question is about — the «راجع المحاضرة» link. */
  lessonTitle: z.string().nullable(),
  lessonId: z.uuid().nullable(),
  courseSlug: z.string(),
});
export type DailyQuestion = z.infer<typeof DailyQuestionSchema>;

/**
 * The answer, once given. Named `wasRight`/`keyOptionIds` rather than
 * `correct`/`rightAnswerOptionIds` because the GET is `@NoAnswerLeak()` for its
 * unanswered half, and this object only ever exists on the answered half.
 */
export const DailyVerdictSchema = z.object({
  wasRight: z.boolean(),
  chosenOptionId: z.uuid().nullable(),
  keyOptionIds: z.array(z.uuid()),
  /** The question's own explanation, when the teacher wrote one. */
  explanationHtml: z.string().nullable(),
});
export type DailyVerdict = z.infer<typeof DailyVerdictSchema>;

export const DailyWeekDaySchema = z.object({
  day: DayKeySchema,
  /** `today` = not answered yet, still open. */
  status: z.enum(['right', 'wrong', 'missed', 'today']),
});

export const DailyStreakSchema = z.object({
  /** Consecutive answered days ending today — or yesterday, while today is still open. */
  current: z.number().int().min(0),
  best: z.number().int().min(0),
  answered: z.number().int().min(0),
  right: z.number().int().min(0),
  todayDone: z.boolean(),
  /** The last seven days, oldest first, today last. */
  week: z.array(DailyWeekDaySchema).length(7),
});
export type DailyStreak = z.infer<typeof DailyStreakSchema>;

export const DailyPayloadSchema = z.object({
  day: DayKeySchema,
  /** `null` when the student's courses have no question to ask yet. */
  question: DailyQuestionSchema.nullable(),
  verdict: DailyVerdictSchema.nullable(),
  streak: DailyStreakSchema,
});
export type DailyPayload = z.infer<typeof DailyPayloadSchema>;

export const DailyAnswerRequestSchema = z.object({ optionId: z.uuid() });
export type DailyAnswerRequest = z.infer<typeof DailyAnswerRequestSchema>;

export const DailyAnswerResultSchema = z.object({
  verdict: DailyVerdictSchema,
  streak: DailyStreakSchema,
});
export type DailyAnswerResult = z.infer<typeof DailyAnswerResultSchema>;

// ─── «ملاحظاتي» ────────────────────────────────────────────────────────────

export const NOTE_BODY_MAX = 1000;
/** Per lesson. A ceiling on a runaway client, not a number anyone reaches. */
export const NOTES_PER_LESSON_MAX = 200;

export const LessonNoteSchema = z.object({
  id: z.uuid(),
  lessonId: z.uuid(),
  /** The second of the video the note is pinned to; `null` = the lesson as a whole. */
  positionSeconds: z.number().int().min(0).nullable(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LessonNote = z.infer<typeof LessonNoteSchema>;

export const LessonNotesSchema = z.object({ notes: z.array(LessonNoteSchema) });
export type LessonNotes = z.infer<typeof LessonNotesSchema>;

const NoteBodySchema = z.string().trim().min(1).max(NOTE_BODY_MAX);

export const NoteCreateSchema = z.object({
  body: NoteBodySchema,
  /** A day, as a sanity ceiling — no lecture here is longer than three hours. */
  positionSeconds: z.number().int().min(0).max(86_400).nullable().optional(),
});
export type NoteCreate = z.infer<typeof NoteCreateSchema>;

export const NoteEditSchema = z.object({ body: NoteBodySchema });
export type NoteEdit = z.infer<typeof NoteEditSchema>;

export const NotebookLessonSchema = z.object({
  lessonId: z.uuid(),
  lessonTitle: z.string(),
  lessonKind: z.enum(['video', 'text', 'quiz', 'attachment']),
  courseSlug: z.string(),
  courseTitle: z.string(),
  subjectNameAr: z.string(),
  notes: z.array(LessonNoteSchema).min(1),
});
export type NotebookLesson = z.infer<typeof NotebookLessonSchema>;

export const NotebookSchema = z.object({
  /** Lessons with at least one note, the most recently written-in first. */
  lessons: z.array(NotebookLessonSchema),
  total: z.number().int().min(0),
});
export type Notebook = z.infer<typeof NotebookSchema>;

// ─── «خطة المذاكرة» ────────────────────────────────────────────────────────

/** The last stretch before the exam is revision, never new lectures. */
export const PLAN_REVISION_MAX_DAYS = 7;
/** Past this many items a day the plan says «ضيقة» instead of pretending. */
export const PLAN_TIGHT_PER_DAY = 5;
/** How far ahead the plan can be set — a year covers any Egyptian school calendar. */
export const PLAN_HORIZON_DAYS = 400;

export const StudyPlanSettingsSchema = z.object({
  examDate: DayKeySchema,
  /** Weekdays off, 0 = Sunday … 6 = Saturday. At most five: a plan needs a day to plan on. */
  daysOff: z.array(z.number().int().min(0).max(6)).max(5),
});
export type StudyPlanSettings = z.infer<typeof StudyPlanSettingsSchema>;

export const PlanDaySchema = z.object({
  date: DayKeySchema,
  kind: z.enum(['study', 'off', 'revision', 'exam']),
  items: z.array(BacklogItemSchema),
});
export type PlanDay = z.infer<typeof PlanDaySchema>;

export const StudyPlanPayloadSchema = z.object({
  settings: StudyPlanSettingsSchema.nullable(),
  today: DayKeySchema,
  /** Whole days from today to the exam; 0 on the day itself. `null` without a plan. */
  daysLeft: z.number().int().nullable(),
  /** Everything still owed, today's included. */
  remaining: z.number().int().min(0),
  /** Lessons, quizzes and homework finished today — counted against today's share. */
  doneToday: z.number().int().min(0),
  perDay: z.number().int().min(0),
  revisionFrom: DayKeySchema.nullable(),
  /**
   * `none` no plan · `onTrack` · `tight` more than `PLAN_TIGHT_PER_DAY` a day ·
   * `clear` nothing owed · `past` the exam date has gone by.
   */
  status: z.enum(['none', 'onTrack', 'tight', 'clear', 'past']),
  /** Today first, up to seven days. */
  days: z.array(PlanDaySchema),
});
export type StudyPlanPayload = z.infer<typeof StudyPlanPayloadSchema>;

// ─── «أوسمتي» ──────────────────────────────────────────────────────────────

export const BADGE_TIERS = ['bronze', 'silver', 'gold'] as const;
export const BadgeTierSchema = z.enum(BADGE_TIERS);
export type BadgeTier = z.infer<typeof BadgeTierSchema>;

/**
 * Every badge is a ladder of three over one number. The thresholds are a claim
 * about effort: bronze is a first week, silver a month of real work, gold a
 * term of it. `stored` keys are `<family>:<tier>` in `student_badges`.
 */
export const BADGE_FAMILIES = [
  { key: 'lessons', targets: [5, 25, 75] },
  { key: 'quizzes', targets: [3, 15, 40] },
  { key: 'fullMarks', targets: [1, 5, 15] },
  { key: 'streak', targets: [3, 7, 30] },
  { key: 'daily', targets: [7, 30, 100] },
  { key: 'homework', targets: [3, 15, 40] },
  { key: 'mistakes', targets: [5, 25, 75] },
  { key: 'notes', targets: [5, 30, 100] },
  { key: 'arena', targets: [1, 10, 40] },
  { key: 'courses', targets: [1, 2, 4] },
] as const satisfies readonly { key: string; targets: readonly [number, number, number] }[];

export type BadgeFamilyKey = (typeof BADGE_FAMILIES)[number]['key'];
export const BadgeFamilyKeySchema = z.enum(
  BADGE_FAMILIES.map((family) => family.key) as [BadgeFamilyKey, ...BadgeFamilyKey[]],
);

export const BadgeFamilyStateSchema = z.object({
  key: BadgeFamilyKeySchema,
  value: z.number().int().min(0),
  tiers: z
    .array(z.object({ tier: BadgeTierSchema, target: z.number().int().min(1), earnedAt: z.string().nullable() }))
    .length(3),
});
export type BadgeFamilyState = z.infer<typeof BadgeFamilyStateSchema>;

export const BadgesPayloadSchema = z.object({
  /** Only the families whose feature is on for this stack. */
  families: z.array(BadgeFamilyStateSchema),
  earned: z.number().int().min(0),
  total: z.number().int().min(0),
  /** Newest first, at most three — the «جديد» strip. */
  recent: z.array(z.object({ key: BadgeFamilyKeySchema, tier: BadgeTierSchema, earnedAt: z.string() })).max(3),
});
export type BadgesPayload = z.infer<typeof BadgesPayloadSchema>;

/** `<family>:<tier>` — the `student_badges.key` of one rung. */
export function badgeKey(family: BadgeFamilyKey, tier: BadgeTier): string {
  return `${family}:${tier}`;
}

// ─── «ملخص الشهر» ─────────────────────────────────────────────────────────

export const RecapPayloadSchema = z.object({
  month: MonthKeySchema,
  /** Months with anything in them, newest first, at most six — the picker. */
  months: z.array(MonthKeySchema),
  /** The month is still running: the numbers are «لحد النهارده». */
  partial: z.boolean(),
  watchMinutes: z.number().int().min(0),
  lessonsCompleted: z.number().int().min(0),
  quizzesTaken: z.number().int().min(0),
  /** Average final mark, 0–100, over the sittings with one. */
  averagePercent: z.number().min(0).max(100).nullable(),
  best: z.object({ title: z.string(), percent: z.number().min(0).max(100) }).nullable(),
  activeDays: z.number().int().min(0),
  daysInMonth: z.number().int().min(28).max(31),
  dailyAnswered: z.number().int().min(0),
  dailyRight: z.number().int().min(0),
  notesWritten: z.number().int().min(0),
  badgesEarned: z.number().int().min(0),
  topCourse: z.object({ title: z.string(), minutes: z.number().int().min(0) }).nullable(),
  /** Cairo hour 0–23 the student watched most in; `null` with no watching. */
  peakHour: z.number().int().min(0).max(23).nullable(),
});
export type RecapPayload = z.infer<typeof RecapPayloadSchema>;

// ─── day arithmetic on `YYYY-MM-DD` keys ──────────────────────────────────

function utcOf(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/** `day` moved by `days` calendar days. */
export function shiftDayKey(day: string, days: number): string {
  const date = utcOf(day);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcOf(to).getTime() - utcOf(from).getTime()) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday, of a calendar day. */
export function weekdayOf(day: string): number {
  return utcOf(day).getUTCDay();
}

/** Days in the month of a `YYYY-MM` key. */
export function daysInMonthKey(month: string): number {
  const [year, mm] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, mm, 0)).getUTCDate();
}

/**
 * The run of answered days ending at `today` — or at yesterday while today is
 * still open, so a student who has not answered YET this morning does not see
 * their streak read zero. `answered` is any set of day keys.
 */
export function currentStreak(answered: ReadonlySet<string>, today: string): number {
  let cursor = answered.has(today) ? today : shiftDayKey(today, -1);
  let run = 0;
  while (answered.has(cursor)) {
    run += 1;
    cursor = shiftDayKey(cursor, -1);
  }
  return run;
}

/** The longest run of consecutive days in `answered`. */
export function bestStreak(answered: ReadonlySet<string>): number {
  const sorted = [...answered].sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of sorted) {
    run = previous !== null && daysBetween(previous, day) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return best;
}
