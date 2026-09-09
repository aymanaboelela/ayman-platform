/**
 * امتحانات الشهر — the scheduled exam, and the ONE definition of what phase
 * one is in.
 *
 * A monthly exam is not a new kind of object. It is an ordinary `Quiz` on an
 * ordinary `Lesson(kind: 'quiz')`, scheduled by the `open_from` / `open_until`
 * columns the quiz engine has always had. What this file adds is the predicate
 * that turns those two timestamps into something a dashboard can render.
 *
 * ⚠️ `examPhase` MUST agree, exactly, with `QuizAccessService.assertCanAttempt`
 * (apps/api/src/modules/quiz/quiz-access.service.ts) — which throws
 * `quiz_not_open_yet` on `now < openFrom` and `quiz_closed` on
 * `now >= openUntil`. The comparisons below are those two, negated, and
 * `scheduled.spec.ts` asserts the pair against each other rather than trusting
 * this comment. If they ever drift, the dashboard invites a student into a 403
 * — a banner that says «ادخل الامتحان» over a door the server has closed.
 *
 * The same reason a second `GRADED_STATES` literal is forbidden: two copies of
 * a predicate are two answers to one question.
 */
import { z } from '@ayman/contracts/zod';

/**
 * `upcoming` — announced, not yet open. The dashboard counts down to it.
 * `open`     — sittable right now. The dashboard offers the one accent CTA.
 * `closed`   — the window has passed. It leaves the dashboard entirely and
 *              lives on in «امتحاناتك» with its score and its review.
 *
 * A quiz with neither timestamp is `open`: that is an ordinary lesson quiz,
 * always available, and it is never surfaced by the scheduled-exam reads.
 */
export const EXAM_PHASES = ['upcoming', 'open', 'closed'] as const;
export const ExamPhaseSchema = z.enum(EXAM_PHASES);
export type ExamPhase = (typeof EXAM_PHASES)[number];

/**
 * The single source of truth for «الامتحان ده فاتح ولا لأ».
 *
 * Takes `now` as an argument rather than calling `new Date()`, for two
 * reasons: the API hands it one instant per request so two exams in the same
 * payload cannot straddle a boundary and disagree, and the browser hands it a
 * server-anchored time so a wrong device clock cannot open an exam early.
 */
export function examPhase(
  openFrom: Date | string | null,
  openUntil: Date | string | null,
  now: Date,
): ExamPhase {
  const from = openFrom === null ? null : new Date(openFrom);
  const until = openUntil === null ? null : new Date(openUntil);

  // Mirrors `assertCanAttempt`'s `now < quiz.openFrom` — strictly before.
  if (from !== null && now < from) return 'upcoming';
  // Mirrors `assertCanAttempt`'s `now >= quiz.openUntil` — inclusive, so the
  // exam is shut ON the closing instant, not one millisecond after it.
  if (until !== null && now >= until) return 'closed';
  return 'open';
}

/**
 * One lesson on an exam's syllabus — «الامتحان ده على الوحدة ١ ٢ ٣».
 *
 * Title only, no href: a covered lesson is a statement about scope, not a
 * link. Linking it would invite the student out of the exam banner and into
 * the player at the moment they are being told to revise.
 */
export const ExamCoveredLessonSchema = z.object({
  lessonId: z.uuid(),
  title: z.string(),
});
export type ExamCoveredLesson = z.infer<typeof ExamCoveredLessonSchema>;

/**
 * A scheduled exam as the STUDENT sees it — the payload behind the dashboard
 * countdown band and the «امتحاناتك» shelf.
 *
 * Deliberately absent: anything about the paper. No question count, no slot
 * list, no marks breakdown. The student learns what the exam covers and when
 * it opens; everything else is the exam itself.
 */
export const StudentExamSchema = z.object({
  /** The exam's LESSON id — the key every student route is already keyed on. */
  lessonId: z.uuid(),
  courseId: z.uuid(),
  courseTitle: z.string(),
  /** The course's public slug, for the link into the exam. */
  courseSlug: z.string(),
  title: z.string(),
  phase: ExamPhaseSchema,
  /**
   * Both nullable because the columns are. A scheduled exam always has
   * `openFrom` (that is what makes it scheduled and what the read filters on);
   * `openUntil` may be absent, which means "open from then on".
   */
  openFrom: z.iso.datetime().nullable(),
  openUntil: z.iso.datetime().nullable(),
  /** The per-sitting time limit in seconds, null when the exam is untimed. */
  durationSeconds: z.number().int().positive().nullable(),
  /** Total marks the paper is scaled to — `quizzes.grade_out_of`. */
  gradeOutOf: z.number(),
  coveredLessons: z.array(ExamCoveredLessonSchema),
  /**
   * Their own best scaled score, once they have a graded sitting. Null — never
   * zero — when they have not sat it: rendering ٠ tells a student who has not
   * taken the exam that they failed it.
   */
  scaledScore: z.number().nullable(),
  /** Whether they have any attempt at all. Distinguishes "not yet" from "0/20". */
  hasSat: z.boolean(),
});
export type StudentExam = z.infer<typeof StudentExamSchema>;

export const StudentExamsSchema = z.object({
  /**
   * Every scheduled exam of every course they are enrolled in, `upcoming` and
   * `open` first (soonest first), then `closed` (most recent first). The
   * dashboard band takes the head of the first group; «امتحاناتك» takes the
   * rest.
   */
  exams: z.array(StudentExamSchema),
  /**
   * The server's own clock at the moment the payload was built. The countdown
   * anchors on this, never on the device's clock — the same discipline
   * `useServerCountdown` already applies inside the attempt runner.
   */
  serverTime: z.iso.datetime(),
});
export type StudentExams = z.infer<typeof StudentExamsSchema>;

/**
 * How soon a countdown starts ticking per-second rather than printing a
 * calendar line.
 *
 * Above this, «فاضل ٥ أيام» is the honest rendering and a live clock is noise
 * that also re-renders the dashboard every second for four days. Below it, the
 * seconds are the point.
 */
export const EXAM_LIVE_COUNTDOWN_SECONDS = 48 * 60 * 60;

/**
 * The title of the per-course section every monthly exam lives on.
 *
 * ⚠️ This string is the ONLY thing that identifies a lesson as a monthly exam.
 * It is matched exactly, it is written by `ScheduledExamsService.ensureShelf`
 * and never by a human, and FOUR separate reads exclude it:
 *
 *   · `PathService`     — or «مسارك» grows exam nodes between the lectures
 *   · `CatalogService`  — or the exam's title appears on the PUBLIC course page
 *   · `CourseService`   — or it becomes an editable outline row and the
 *                         «ما يبقاش يضاف الكويز لوحده» rule is undone sideways
 *   · the coverage picker itself — an exam is never on another exam
 *
 * It lives in contracts rather than in the quiz module so those four can import
 * it without any of them depending on `QuizModule`. A `course_sections.kind`
 * column would be the tidier answer and was rejected: it is a migration to say
 * something the shelf's own existence already says, and every read here is
 * keyed on the section this returns anyway.
 */
export const EXAM_SHELF_TITLE = 'امتحانات الشهر';
