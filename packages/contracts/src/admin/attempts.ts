import { z } from '@ayman/contracts/zod';
import { PAGE_SIZES } from '@ayman/contracts/admin/list';
import { QuestionTypeSchema } from '@ayman/contracts/quiz/question';
import { CORRECTNESS_VALUES } from '@ayman/contracts/quiz/attempt';
import { QuizPaperSchema } from '@ayman/contracts/quiz/quiz-settings';

/**
 * Row/response schemas, and the two READ queries behind `/admin/attempts`.
 * Plan 5 owns `AttemptAdminService` and every write DTO behind
 * `/api/admin/attempts` (`ReopenAttemptDto`, `GrantExtraTimeDto` in
 * `apps/api/src/modules/quiz/dto/*`) — duplicating them here would be a
 * second, driftable definition of the same wire shape. These match the ACTUAL
 * return shape of `AttemptAdminService`, not the illustrative draft in the plan
 * document (which used different field/state names).
 *
 * ⚠️ Everything added for the by-course screen (2026-10) is read by SERVER
 * code only — the API and `(admin)/admin/attempts/page.tsx`. This module is
 * also imported by client components, and a tab left open across a deploy
 * keeps the module it loaded first (Turbopack ids are path-derived), so a
 * client component reading an export added here would find `undefined` in
 * that tab. Keep it that way, or put the new value in a new module.
 */

/**
 * How the sittings list is ordered.
 *
 * Declared HERE and not in the service so the URL parser, the dropdown and the
 * Prisma `orderBy` all read one list — a value that exists in the API and is
 * unreachable from the screen is the failure this file's siblings keep
 * recording.
 *
 * `newest` is the default: the marking queue is worked newest-first. The two
 * score orders are the addition — a paper at 30% and one at 95% need opposite
 * kinds of attention, and finding either meant reading the whole list.
 */
export const ATTEMPT_SORTS = ['newest', 'oldest', 'score_desc', 'score_asc'] as const;
export type AdminAttemptSort = (typeof ATTEMPT_SORTS)[number];

export const ATTEMPT_STATES = [
  'in_progress',
  'overdue',
  'submitted',
  'pending_review',
  'abandoned',
] as const;

export type AdminAttemptState = (typeof ATTEMPT_STATES)[number];

/**
 * What a quiz IS, as the instructor names it — the question the old flat list
 * could not answer («ده امتحان إيه وفي أنهي كورس»).
 *
 * Derived by the API on every read, never stored, from the two facts that
 * already decide it everywhere else: `courses.exam_lesson_id` names the course
 * exam, and a quiz on the «امتحانات الشهر» shelf is a monthly exam
 * (`isMonthlyExamLesson`). Everything else is a lecture's quiz — including a
 * quiz attached directly to a video lecture, which is still that lecture's.
 */
export const ATTEMPT_QUIZ_KINDS = ['lecture_quiz', 'course_exam', 'monthly_exam'] as const;
export type AttemptQuizKind = (typeof ATTEMPT_QUIZ_KINDS)[number];

export const AdminAttemptRowSchema = z.object({
  id: z.string(),
  userId: z.string(),
  studentName: z.string(),
  quizId: z.string(),
  /** The lesson title — a quiz has no title of its own. Kept beside
   *  `lessonTitle` for the callers that predate it. */
  quizTitle: z.string(),
  attemptNumber: z.number().int().positive(),
  state: z.enum(ATTEMPT_STATES),
  /**
   * The SCALED mark, out of `gradeOutOf` (17 of 20) — not a fraction.
   *
   * This comment used to say «0..1 — the fraction primitive», which was never
   * what the service sent: it has always been `scaled_score`. On a
   * `pending_review` sitting it is PROVISIONAL — unmarked essays count as zero
   * until someone marks them (`grading/mark-split.ts`) — which is why
   * `percent` below is null for one.
   */
  score: z.number().nullable(),
  startedAt: z.string(),
  submittedAt: z.string().nullable(),
  deadlineAt: z.string().nullable(),
  /** Which paper this sitting drew — `improvement` only ever on a course exam's
   *  second sitting (تحسين). */
  paper: QuizPaperSchema,
  /** The sitting's OWN snapshot (B7), not the quiz's live value. */
  gradeOutOf: z.number(),
  /**
   * `score / gradeOutOf` as 0–100, and only for a FULLY marked paper
   * (`submitted`). Null while the paper is open, abandoned, or still waiting on
   * an essay — a provisional number on this screen would read as the verdict.
   * Unbounded on purpose: an overridden score above the scale is a fact to
   * show, not a reason to fail the whole page in the parser.
   */
  percent: z.number().nullable(),
  /** The verdict, under the same rule as `percent`: null unless `submitted`. */
  passed: z.boolean().nullable(),
  courseId: z.string(),
  courseTitle: z.string(),
  sectionTitle: z.string(),
  lessonId: z.string(),
  lessonTitle: z.string(),
  kind: z.enum(ATTEMPT_QUIZ_KINDS),
});

export type AdminAttemptRow = z.infer<typeof AdminAttemptRowSchema>;

/** How many sittings sit in each state for the CURRENT filter, state aside —
 *  the numbers on the state tabs, so a tab never promises rows it will not
 *  show once a student search is applied. */
export const AdminAttemptStateCountsSchema = z.object({
  in_progress: z.number().int().min(0),
  overdue: z.number().int().min(0),
  submitted: z.number().int().min(0),
  pending_review: z.number().int().min(0),
  abandoned: z.number().int().min(0),
});
export type AdminAttemptStateCounts = z.infer<typeof AdminAttemptStateCountsSchema>;

/**
 * `GET /api/admin/attempts` — one page of sittings, with the TOTAL.
 *
 * It used to answer a bare array with no count, so the screen asked for one
 * row more than it showed to guess whether a next page existed and could never
 * say «٢١–٤٠ من ٣١٢». `{ rows, rowCount }` is the shape every other admin list
 * already answers (`listResponse` in `./list`); `stateCounts` rides along for
 * the tabs.
 *
 * ⚠️ `GET /api/admin/quizzes/:quizId/attempts` still answers the bare array —
 * `/admin/quizzes/[quizId]/attempts` parses it that way.
 */
export const AdminAttemptListSchema = z.object({
  rows: z.array(AdminAttemptRowSchema),
  rowCount: z.number().int().min(0),
  stateCounts: AdminAttemptStateCountsSchema,
});
export type AdminAttemptList = z.infer<typeof AdminAttemptListSchema>;

/* ── the two read queries ─────────────────────────────────────────────────── */

/** A blank query value is an absent one: a GET form submits `q=` for an empty
 *  box, and that must read as «no search», not fail the uuid check below. */
function blankAsAbsent(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

/** A uuid column filter. `uuid()` rather than a bare string: it lands in a
 *  Prisma `where` and a `::uuid[]` parameter, and junk there is a 500 from
 *  Postgres instead of the 400 a bad filter deserves. */
const optionalUuid = z.preprocess(blankAsAbsent, z.uuid().optional());

/** The search box. 120 is `ListQuerySchema`'s own bound. */
const optionalSearch = z.preprocess(blankAsAbsent, z.string().trim().max(120).optional());

/**
 * `GET /api/admin/attempts` — the sittings list.
 *
 * NOT `.strict()`: a query string is a place where an unrelated parameter
 * legitimately rides along (the screen's own `oq`, a bookmark's leftovers), and
 * 400-ing a READ over one would break a link rather than catch a bug. The
 * legacy `take`/`skip` pair is ignored for the same reason — the one caller
 * that sent it was the page this replaced.
 */
export const AdminAttemptListQuerySchema = z.object({
  courseId: optionalUuid,
  quizId: optionalUuid,
  /** The quiz by its LESSON, which is the id the course editor and the
   *  analytics screens hold. */
  lessonId: optionalUuid,
  /** A better-auth id is a nanoid, never a uuid — `z.uuid()` here would 400
   *  every real student (only seeded and e2e accounts carry uuids). */
  userId: z.preprocess(blankAsAbsent, z.string().max(64).optional()),
  state: z.preprocess(blankAsAbsent, z.enum(ATTEMPT_STATES).optional()),
  /** The STUDENT: name (hamza-insensitive) or any run of their phone digits. */
  q: optionalSearch,
  /** ⚠️ Reaches an `orderBy` through a fixed switch in the service — the enum
   *  IS the sanitisation. */
  sort: z.preprocess(blankAsAbsent, z.enum(ATTEMPT_SORTS).default('newest')),
  page: z.preprocess(blankAsAbsent, z.coerce.number().int().min(1).default(1)),
  perPage: z.preprocess(
    blankAsAbsent,
    z.coerce
      .number()
      .int()
      .refine((n) => (PAGE_SIZES as readonly number[]).includes(n))
      .default(20),
  ),
});
export type AdminAttemptListQuery = z.infer<typeof AdminAttemptListQuerySchema>;

/**
 * `GET /api/admin/attempts/overview` — every quiz, under its course and unit.
 *
 * `quizId` / `lessonId` narrow it to ONE quiz, which is how the quiz view
 * reads its own header: the same numbers the overview card showed, from the
 * same query, so the two cannot disagree. `q` matches quiz, unit and course
 * TITLES; the student half of the search box is `AdminAttemptListQuerySchema`.
 */
export const AdminAttemptsOverviewQuerySchema = z.object({
  courseId: optionalUuid,
  quizId: optionalUuid,
  lessonId: optionalUuid,
  q: optionalSearch,
});
export type AdminAttemptsOverviewQuery = z.infer<typeof AdminAttemptsOverviewQuerySchema>;

/** One course in the picker. Only courses with at least one sitting — a course
 *  nobody has sat anything in has nothing to show here. */
export const AdminAttemptCourseOptionSchema = z.object({
  courseId: z.string(),
  courseTitle: z.string(),
  attempts: z.number().int().min(0),
});
export type AdminAttemptCourseOption = z.infer<typeof AdminAttemptCourseOptionSchema>;

/**
 * One quiz on the overview, with its numbers.
 *
 * The lines arrive in the COURSE's own order — course, then unit, then lesson
 * position — and the screen folds consecutive lines rather than re-sorting
 * (`attempts/groups.ts`), so there is one answer to what comes first.
 */
export const AdminAttemptQuizSummarySchema = z.object({
  quizId: z.string(),
  lessonId: z.string(),
  /** As the instructor wrote it — usually already «كويز الدرس الأول…». */
  lessonTitle: z.string(),
  kind: z.enum(ATTEMPT_QUIZ_KINDS),
  /**
   * «المحاضرة ٣» — the place, in the WHOLE course, of the lecture this quiz
   * checks: the number a student sees beside that lecture. Null for the two
   * exams, and for a quiz whose lecture is not published (students see no
   * number there either).
   */
  lectureNumber: z.number().int().positive().nullable(),
  /** Reachable by a student: quiz, lesson and unit all published. */
  published: z.boolean(),
  courseId: z.string(),
  courseTitle: z.string(),
  courseArchived: z.boolean(),
  sectionId: z.string(),
  sectionTitle: z.string(),
  /** The quiz's LIVE settings — a sitting snapshots its own (B7). */
  gradeOutOf: z.number(),
  passPercent: z.number(),
  allowsImprovement: z.boolean(),
  attempts: z.number().int().min(0),
  /** Distinct accounts — an improvement sitting is a second attempt by the
   *  same student, and «٤٠ محاولة» is not «٤٠ طالب». */
  students: z.number().int().min(0),
  inProgress: z.number().int().min(0),
  overdue: z.number().int().min(0),
  submitted: z.number().int().min(0),
  pendingReview: z.number().int().min(0),
  abandoned: z.number().int().min(0),
  /** 0–100, over FULLY marked sittings only (`submitted`): a paper waiting on
   *  an essay counts that essay as zero, and averaging it in would sink every
   *  essay exam's mean until the marking is done. Null when there are none. */
  averagePercent: z.number().nullable(),
  /** 0–100, the share of those same sittings that passed. */
  passRatePercent: z.number().nullable(),
  lastActivityAt: z.string().nullable(),
});
export type AdminAttemptQuizSummary = z.infer<typeof AdminAttemptQuizSummarySchema>;

export const AdminAttemptsOverviewSchema = z.object({
  courses: z.array(AdminAttemptCourseOptionSchema),
  quizzes: z.array(AdminAttemptQuizSummarySchema),
});
export type AdminAttemptsOverview = z.infer<typeof AdminAttemptsOverviewSchema>;


/* ── «شوف ورقته» ──────────────────────────────────────────────────────────── */

/**
 * One question on a student's paper, as the INSTRUCTOR sees it.
 *
 * ⚠️ Every field is required here and OPTIONAL on the learner's `ReviewQuestion`,
 * and that difference is the whole point. The student's serializer omits
 * whatever the review-window matrix forbids, so its type has to make each
 * field optional; the admin route resolves every flag to `true`, so a missing
 * field would mean the question genuinely has none — not that the reader was
 * not allowed to see it. Typing it as required is what stops the popup from
 * rendering «مفيش إجابة صح» for an answer it simply was not sent.
 */
export const AdminAttemptReviewQuestionSchema = z.object({
  slotPosition: z.number().int().nonnegative(),
  questionId: z.string(),
  attemptQuestionId: z.string(),
  type: QuestionTypeSchema,
  stemHtml: z.string(),
  options: z.array(z.object({ id: z.string(), bodyHtml: z.string() })),
  /** The student's own stored answer. `null` when they never answered — which
   *  is a different fact from answering wrongly, and `correctness` below keeps
   *  them apart. */
  response: z.unknown().nullable(),
  /** The SAME union the learner's review screen branches on — not a superset.
   *  The admin popup renders through the identical `ReviewQuestion` component,
   *  and a value it has no case for would fall through to a blank chip. */
  correctness: z.enum(CORRECTNESS_VALUES),
  mark: z.number().nullable(),
  maxMark: z.number(),
  feedbackHtml: z.string().optional(),
  generalFeedbackHtml: z.string().optional(),
  /** Display prose. Never split back apart to find the right option — that is
   *  what `rightAnswerOptionIds` is for, and the reason it exists (I9). */
  rightAnswerText: z.string().optional(),
  /** The correct options' own ids, for the per-option highlight. */
  rightAnswerOptionIds: z.array(z.string()).optional(),
});
export type AdminAttemptReviewQuestion = z.infer<typeof AdminAttemptReviewQuestionSchema>;

/**
 * `GET /api/admin/attempts/:id/review` — «هو غلط في إيه».
 *
 * The WHOLE paper, with each question marked, and never only the failures:
 * «٣ غلط» is a number that needs «من ١٢» beside it to mean anything, and a
 * payload filtered down to the wrong ones cannot supply the denominator.
 */
export const AdminAttemptReviewSchema = z.object({
  attemptId: z.string(),
  studentId: z.string(),
  studentName: z.string(),
  quizTitle: z.string(),
  submittedAt: z.string().nullable(),
  rawScore: z.number().nullable(),
  scaledScore: z.number().nullable(),
  gradeOutOf: z.number(),
  sumMarks: z.number(),
  passPercent: z.number(),
  passed: z.boolean().nullable(),
  questions: z.array(AdminAttemptReviewQuestionSchema),
  /** Anything that did not score full marks, blanks included — see the
   *  service's own note on why an unanswered question counts here. */
  wrongCount: z.number().int().min(0),
  totalCount: z.number().int().min(0),
});
export type AdminAttemptReview = z.infer<typeof AdminAttemptReviewSchema>;
