import { z } from '@ayman/contracts/zod';
import { HOMEWORK_KEY_PATTERN } from '@ayman/contracts/admin/media';

/**
 * «السؤال المقالي اليومي» — one written question a day, answered on paper
 * (photographed) or typed, and marked by hand against a model answer.
 *
 * ## No relative imports
 *
 * Same rule as `homework.ts`: a leaf module both apps reach through
 * `@ayman/contracts/daily-essay` without tripping Node's native ESM loader on
 * the root barrel. See `contracts-barrel.check.ts`.
 *
 * ## Scheduled, not dealt
 *
 * «سؤال اليوم» (`engagement.ts`) deals each student their own question from the
 * bank and marks it by machine. This is the opposite on both counts: the
 * teacher writes the questions ahead with a model answer each, lays them on
 * the calendar, and a person marks every answer. So the day's question is the
 * same for everyone in its audience.
 *
 * ## Where the WORDS are
 *
 * `@ayman/contracts/copy/daily-essay` — nothing a student or a marker reads is
 * in this file.
 */

/* ── bounds ──────────────────────────────────────────────────────────── */

/** Same ceilings as الواجب, and the CHECKs in the migration. */
export const MAX_ESSAY_IMAGES = 8;
export const DEFAULT_ESSAY_IMAGES = 4;
export const MAX_ESSAY_TEXT = 10_000;
export const MAX_ESSAY_MARKS = 100;
export const DEFAULT_ESSAY_MARKS = 10;

/**
 * How many Cairo days a question takes answers for: its own day and the one
 * after.
 *
 * Two rather than one so a student who opens the platform after midnight, or
 * who missed a single evening, still has yesterday's question. Not longer,
 * because the model answer is shown to every student whose answer has been
 * marked — a question left open for a week is one whose answer is in the class
 * group before most of the class has written theirs.
 */
export const ESSAY_OPEN_DAYS = 2;

/** How long an UNMARKED answer's photographs are kept. Marking deletes them at once. */
export const ESSAY_IMAGE_RETENTION_DAYS = 30;

/** How many past questions the student's page lists. */
export const ESSAY_HISTORY_LIMIT = 30;

/** The most questions one «إضافة» writes. A term of school days fits. */
export const MAX_ESSAY_BATCH = 120;

const DayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/* ── the question, as the teacher writes it ──────────────────────────── */

/** PLAIN TEXT with newlines, never HTML — same rule as `HomeworkWriteSchema`. */
const EssayItemSchema = z
  .object({
    body: z.string().trim().min(3).max(4000),
    modelAnswer: z.string().trim().min(1).max(8000),
    maxMarks: z.number().int().min(1).max(MAX_ESSAY_MARKS).default(DEFAULT_ESSAY_MARKS),
  })
  .strict();

/**
 * «إضافة أسئلة» — several questions at once, laid on consecutive days.
 *
 * The teacher does not pick a date per question: the first lands on
 * `startDay`, each next one on the next day that is not in `skipWeekdays`
 * (0 = Sunday … 6 = Saturday, so «من غير الجمعة» is `[5]`). `layEssayDays`
 * below is that walk, shared by the form's preview and the API's write so the
 * two cannot disagree about which day a question lands on.
 */
export const DailyEssayBatchSchema = z
  .object({
    /** Empty = every student with live access to any course. */
    courseIds: z.array(z.uuid()).max(50).default([]),
    startDay: DayKeySchema,
    skipWeekdays: z.array(z.number().int().min(0).max(6)).max(6).default([]),
    maxImages: z.number().int().min(1).max(MAX_ESSAY_IMAGES).default(DEFAULT_ESSAY_IMAGES),
    isPublished: z.boolean().default(true),
    items: z.array(EssayItemSchema).min(1).max(MAX_ESSAY_BATCH),
  })
  .strict();

export type DailyEssayBatchInput = z.infer<typeof DailyEssayBatchSchema>;

/**
 * An edit to one question. Every field optional and NONE defaulted: a default
 * on a partial update silently rewrites what the caller did not send.
 */
export const DailyEssayUpdateSchema = z
  .object({
    day: DayKeySchema.optional(),
    body: z.string().trim().min(3).max(4000).optional(),
    modelAnswer: z.string().trim().min(1).max(8000).optional(),
    maxMarks: z.number().int().min(1).max(MAX_ESSAY_MARKS).optional(),
    maxImages: z.number().int().min(1).max(MAX_ESSAY_IMAGES).optional(),
    isPublished: z.boolean().optional(),
    courseIds: z.array(z.uuid()).max(50).optional(),
  })
  .strict();

export type DailyEssayUpdateInput = z.infer<typeof DailyEssayUpdateSchema>;

function utcOf(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/** `day` moved by `offset` calendar days, as a `YYYY-MM-DD` key. */
export function shiftEssayDay(day: string, offset: number): string {
  const date = utcOf(day);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/**
 * The days `count` questions land on, starting at `startDay` and stepping over
 * `skipWeekdays`. Skipping all seven would never end, so the schema caps the
 * list at six and this walks at most a bounded number of days.
 */
export function layEssayDays(startDay: string, count: number, skipWeekdays: readonly number[]): string[] {
  const skip = new Set(skipWeekdays);
  const days: string[] = [];
  let cursor = startDay;
  for (let guard = 0; days.length < count && guard < count * 7 + 7; guard += 1) {
    if (!skip.has(utcOf(cursor).getUTCDay())) days.push(cursor);
    cursor = shiftEssayDay(cursor, 1);
  }
  return days;
}

/** Whether a question dated `essayDay` still takes answers on `today`. */
export function essayIsOpen(essayDay: string, today: string): boolean {
  return essayDay <= today && today < shiftEssayDay(essayDay, ESSAY_OPEN_DAYS);
}

/* ── the answer ──────────────────────────────────────────────────────── */

export const DAILY_ESSAY_STATUSES = ['submitted', 'marked'] as const;
export const DailyEssayStatusSchema = z.enum(DAILY_ESSAY_STATUSES);
export type DailyEssayStatus = z.infer<typeof DailyEssayStatusSchema>;

/** One uploaded page — the same two-step upload as الواجب, and `hw/` keys only. */
const EssayImageInputSchema = z
  .object({
    storageKey: z.string().max(255).regex(HOMEWORK_KEY_PATTERN),
    sizeBytes: z.number().int().positive(),
  })
  .strict();

export type EssayImageInput = z.infer<typeof EssayImageInputSchema>;

/**
 * The hand-in: photographs OR typed text, never both and never neither.
 *
 * One shape rather than two routes (which is what الواجب has) because here
 * typing is open to every student, not a per-device option behind its own
 * feature key.
 */
export const DailyEssaySubmitSchema = z
  .object({
    images: z.array(EssayImageInputSchema).max(MAX_ESSAY_IMAGES).default([]),
    text: z.string().trim().max(MAX_ESSAY_TEXT).nullable().default(null),
  })
  .strict()
  .refine((value) => (value.images.length > 0) !== (value.text !== null && value.text.length > 0), {
    message: 'صور الحل أو الحل مكتوب، واحد منهم',
    path: ['images'],
  });

export type DailyEssaySubmitInput = z.infer<typeof DailyEssaySubmitSchema>;

/** The student's own view of where their answer stands. */
export const MyEssaySubmissionSchema = z.object({
  id: z.uuid(),
  status: DailyEssayStatusSchema,
  imageCount: z.number().int().min(0),
  /** Ids only — the bytes come from `GET /api/me/essay/images/:id`. Empty once purged. */
  imageIds: z.array(z.uuid()),
  imagesPurged: z.boolean(),
  answerText: z.string().nullable(),
  mark: z.number().nullable(),
  /** The total the mark is out of, frozen at the marking; `null` until marked. */
  maxMarks: z.number().int().nullable(),
  reviewNote: z.string().nullable(),
  submittedAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
});

export type MyEssaySubmission = z.infer<typeof MyEssaySubmissionSchema>;

/**
 * One question as a student sees it.
 *
 * `modelAnswer` is `null` until the student has earned it: their own answer is
 * marked, or the question has closed (so a student who never answered can
 * still learn from it). It is never sent while the student could still hand in
 * an answer copied from it.
 */
export const StudentEssaySchema = z.object({
  id: z.uuid(),
  day: DayKeySchema,
  body: z.string(),
  maxMarks: z.number().int(),
  maxImages: z.number().int(),
  /** Still takes answers today. */
  open: z.boolean(),
  submission: MyEssaySubmissionSchema.nullable(),
  modelAnswer: z.string().nullable(),
});

export type StudentEssay = z.infer<typeof StudentEssaySchema>;

export const EssayStatsSchema = z.object({
  /** Questions this student answered, marked or not. */
  answered: z.number().int().min(0),
  marked: z.number().int().min(0),
  /** Marks earned over marks possible across the marked answers, 0–100; `null` with none marked. */
  averagePercent: z.number().min(0).max(100).nullable(),
});

export type EssayStats = z.infer<typeof EssayStatsSchema>;

/** `GET /api/me/essay` — the whole page. */
export const EssayPayloadSchema = z.object({
  /** The Cairo day the server answered on. */
  day: DayKeySchema,
  /** Today's question, or `null` on a day with none for this student. */
  today: StudentEssaySchema.nullable(),
  /** Earlier questions, newest first — including yesterday's while it is still open. */
  history: z.array(StudentEssaySchema),
  stats: EssayStatsSchema,
});

export type EssayPayload = z.infer<typeof EssayPayloadSchema>;

/**
 * `GET /api/me/essay/summary` — the home card. Today's question when there is
 * one, otherwise the newest one still open, otherwise `null` and no card.
 */
export const EssaySummarySchema = z.object({
  /** The Cairo day the server answered on — tells «النهارده» from «امبارح». */
  day: DayKeySchema,
  essay: StudentEssaySchema.nullable(),
  stats: EssayStatsSchema,
});

export type EssaySummary = z.infer<typeof EssaySummarySchema>;

/* ── the teacher's side: the schedule ────────────────────────────────── */

export const ESSAY_SCHEDULE_FILTERS = ['upcoming', 'past', 'all'] as const;
export const EssayScheduleFilterSchema = z.enum(ESSAY_SCHEDULE_FILTERS).default('upcoming');
export type EssayScheduleFilter = z.infer<typeof EssayScheduleFilterSchema>;

export const AdminEssaySchema = z.object({
  id: z.uuid(),
  day: DayKeySchema,
  body: z.string(),
  modelAnswer: z.string(),
  maxMarks: z.number().int(),
  maxImages: z.number().int(),
  isPublished: z.boolean(),
  courses: z.array(z.object({ id: z.uuid(), title: z.string() })),
  /** Answers handed in, and how many of them are still waiting on a mark. */
  submitted: z.number().int().min(0),
  pending: z.number().int().min(0),
});

export type AdminEssay = z.infer<typeof AdminEssaySchema>;

export const AdminEssayScheduleSchema = z.object({
  /** The Cairo day the server answered on — «النهارده» on the schedule. */
  today: DayKeySchema,
  /** The day after the last scheduled question (or today) — where «إضافة» starts by default. */
  nextFreeDay: DayKeySchema,
  rows: z.array(AdminEssaySchema),
  rowCount: z.number().int().min(0),
});

export type AdminEssaySchedule = z.infer<typeof AdminEssayScheduleSchema>;

/* ── the teacher's side: marking ─────────────────────────────────────── */

export const ESSAY_QUEUE_FILTERS = ['pending', 'marked', 'all'] as const;
export const EssayQueueFilterSchema = z.enum(ESSAY_QUEUE_FILTERS).default('pending');
export type EssayQueueFilter = z.infer<typeof EssayQueueFilterSchema>;

export const AdminEssaySubmissionRowSchema = z.object({
  id: z.uuid(),
  status: DailyEssayStatusSchema,
  imageCount: z.number().int(),
  typed: z.boolean(),
  imagesPurged: z.boolean(),
  mark: z.number().nullable(),
  maxMarks: z.number().int(),
  submittedAt: z.iso.datetime(),
  studentId: z.string(),
  studentName: z.string(),
  essayId: z.uuid(),
  essayDay: DayKeySchema,
  /** The question's first line, for the queue row. */
  essayExcerpt: z.string(),
  /** Who marked it, for «اتصحّح» rows; `null` while waiting or once that account is gone. */
  markerName: z.string().nullable(),
});

export type AdminEssaySubmissionRow = z.infer<typeof AdminEssaySubmissionRowSchema>;

export const AdminEssaySubmissionDetailSchema = AdminEssaySubmissionRowSchema.extend({
  body: z.string(),
  modelAnswer: z.string(),
  imageIds: z.array(z.uuid()),
  answerText: z.string().nullable(),
  reviewNote: z.string().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  studentPhone: z.string().nullable(),
  /**
   * The next answer still waiting, so «حفظ والتالي» goes straight to it — the
   * same question's answers first (one model answer in the marker's head),
   * then the oldest waiting anywhere. `null` when the queue is empty.
   */
  nextPendingId: z.uuid().nullable(),
  /** How many answers are waiting in total, this one included when it is. */
  pendingCount: z.number().int().min(0),
});

export type AdminEssaySubmissionDetail = z.infer<typeof AdminEssaySubmissionDetailSchema>;

/**
 * The mark. Out of the question's own `maxMarks` — the API refuses a mark
 * above it, since only the server knows the total. Half marks allowed.
 * `note` is optional: the model answer beside the mark already says most of
 * it, and a required sentence on the two-hundredth answer becomes «تمام».
 */
export const DailyEssayMarkSchema = z
  .object({
    mark: z.number().min(0).max(MAX_ESSAY_MARKS).multipleOf(0.5),
    note: z.string().trim().max(1000).nullable().default(null),
  })
  .strict();

export type DailyEssayMarkInput = z.infer<typeof DailyEssayMarkSchema>;

export const EssayPendingCountSchema = z.object({ pending: z.number().int().min(0) });
export type EssayPendingCount = z.infer<typeof EssayPendingCountSchema>;
