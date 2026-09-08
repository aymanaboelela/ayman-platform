import { z } from '@ayman/contracts/zod';
import { ExamPhaseSchema } from '@ayman/contracts/quiz/scheduled';

/**
 * `/admin/exams` — «امتحانات الشهر».
 *
 * ## Why this is its own screen and not part of the course editor
 *
 * A COURSE exam is reached through `courses.exam_lesson_id`, belongs to exactly
 * one course's outline, and is already linked from inside `/admin/courses/[id]`.
 * A MONTHLY exam is a different object: it covers a chosen SUBSET of lessons, it
 * carries its own open/close window, and four of them are authored a month
 * across four courses. The question the owner actually asks is «إيه اللي نازل
 * ومتى؟» — a cross-course list — and that list cannot live inside any single
 * course's editor.
 *
 * ## Why the exam has no `kind` column and no `month` column
 *
 * «This is a scheduled exam» is DERIVED, and the derivation has exactly one
 * home: `examPhase()` in `@ayman/contracts/quiz/scheduled` plus the WHERE clause
 * in `ScheduledExamsService`. The moment `month` is a column, something has to
 * decide what happens the month he runs three exams — and the answer would be a
 * constraint refusing him one at 19:45 on a Friday. «نص الشهر» / «آخر الشهر» is
 * what he TYPES in the title, because that is what it is: a name.
 *
 * ## The one thing this screen must never become
 *
 * `LESSON_KINDS` in the lesson panel is `['video','text','attachment']` on
 * purpose — a standalone quiz in the course outline was counted as a lecture,
 * numbered as one, and could shut the rest of the course behind one failed
 * sitting («ما يبقاش يضاف الكويز لوحده»). A monthly exam is the case that rule
 * was not about. It stays out of the outline, out of `/api/me/path` and out of
 * the public catalogue, and this screen is the only door to it.
 */

/** Marks a paper is scaled to. Bounded because a typo here is a wrong grade for
 *  a whole cohort, and 1000 is already absurd for a school exam. */
const GRADE_OUT_OF = z.number().min(1).max(1000);

/** Minutes, not seconds, at the API edge — he types minutes. The service
 *  multiplies. Capped at 8 hours: longer is a mistyped field, not an exam. */
const DURATION_MINUTES = z.number().int().min(1).max(480);

/**
 * Creating a monthly exam. ONE submit produces: the course's «امتحانات الشهر»
 * section (on first use), the exam's `Lesson(kind:'quiz')`, its `Quiz` with the
 * window and the timer, and its coverage rows.
 *
 * It arrives as a DRAFT — `isPublished: false` on both the lesson and the quiz —
 * because an exam with no questions in it must not be able to reach a student.
 * Publishing is its own explicit act with its own preflight.
 */
export const AdminExamCreateSchema = z
  .object({
    courseId: z.uuid(),
    /** «امتحان نص شهر سبتمبر» — his words, not a generated string. */
    title: z.string().trim().min(3).max(120),
    /**
     * The lessons the exam is on. At least one, by his own rule («لازم أضيف
     * درس»): an exam that covers nothing tells the student nothing about what
     * to revise, which is the whole reason the syllabus line exists.
     *
     * Order is the order he picked them in, and it is what the student reads.
     */
    coveredLessonIds: z.array(z.uuid()).min(1).max(60),
    /** Naive local wall clock from a `datetime-local` input, coerced the same
     *  way `QuizSettingsSchema` already coerces `openFrom`/`openUntil`. */
    opensAt: z.coerce.date(),
    closesAt: z.coerce.date(),
    durationMinutes: DURATION_MINUTES,
    gradeOutOf: GRADE_OUT_OF.default(100),
    passPercent: z.number().min(0).max(100).default(70),
  })
  .strict()
  .refine((v) => v.closesAt > v.opensAt, {
    message: 'closesAt must be after opensAt',
    path: ['closesAt'],
  })
  .refine((v) => new Set(v.coveredLessonIds).size === v.coveredLessonIds.length, {
    message: 'coveredLessonIds must be unique',
    path: ['coveredLessonIds'],
  });
export type AdminExamCreateInput = z.infer<typeof AdminExamCreateSchema>;

/**
 * Editing one. Written out BY HAND as an all-optional object — never
 * `AdminExamCreateSchema.partial()`.
 *
 * `.partial()` keeps every `.default()`, so a PATCH that only renames an exam
 * would silently also write `gradeOutOf: 100` and `passPercent: 70` over
 * whatever he had set. That exact mechanism once unpublished a lesson in this
 * repo when someone renamed it. `courseId` is absent entirely: moving an exam
 * between courses would strand its coverage rows against the composite FKs, and
 * the honest answer is to delete it and make another.
 */
export const AdminExamPatchSchema = z
  .object({
    title: z.string().trim().min(3).max(120).optional(),
    coveredLessonIds: z.array(z.uuid()).min(1).max(60).optional(),
    opensAt: z.coerce.date().optional(),
    closesAt: z.coerce.date().optional(),
    durationMinutes: DURATION_MINUTES.optional(),
    gradeOutOf: GRADE_OUT_OF.optional(),
    passPercent: z.number().min(0).max(100).optional(),
  })
  .strict()
  .refine((v) => v.opensAt === undefined || v.closesAt === undefined || v.closesAt > v.opensAt, {
    message: 'closesAt must be after opensAt',
    path: ['closesAt'],
  })
  .refine(
    (v) =>
      v.coveredLessonIds === undefined ||
      new Set(v.coveredLessonIds).size === v.coveredLessonIds.length,
    { message: 'coveredLessonIds must be unique', path: ['coveredLessonIds'] },
  );
export type AdminExamPatchInput = z.infer<typeof AdminExamPatchSchema>;

/** One row of the cross-course list. */
export const AdminExamRowSchema = z.object({
  lessonId: z.uuid(),
  quizId: z.uuid().nullable(),
  courseId: z.uuid(),
  courseTitle: z.string(),
  title: z.string(),
  phase: ExamPhaseSchema,
  opensAt: z.iso.datetime().nullable(),
  closesAt: z.iso.datetime().nullable(),
  durationMinutes: z.number().int().positive().nullable(),
  gradeOutOf: z.number(),
  /** Both must be true for a student to reach it, and the row shows them
   *  separately: a published quiz on an unpublished lesson is invisible, and
   *  the difference is the first thing he needs to see when it is missing. */
  lessonPublished: z.boolean(),
  quizPublished: z.boolean(),
  /**
   * ⚠️ Surfaced on every row because of a real asymmetry:
   * `LessonAccessService.resolve` does NOT check `section.isPublished` while
   * `LessonGateService.resolveCourse` DOES. So an unpublished «امتحانات الشهر»
   * shelf 404s the intro page for everyone while `assertCanAttempt` still opens
   * attempts — a silent, total failure at 20:01 with no error anywhere. If this
   * is ever false, that is the reason, and the row says so.
   */
  sectionPublished: z.boolean(),
  questionCount: z.number().int().nonnegative(),
  coveredLessons: z.array(z.object({ lessonId: z.uuid(), title: z.string() })),
  /** Sittings so far. Non-zero is what makes delete refuse. */
  attemptCount: z.number().int().nonnegative(),
  /** Sittings with an ungraded essay. Until these are marked, every one of them
   *  scores that question 0 — and would rank that student wrongly. */
  needsGradingCount: z.number().int().nonnegative(),
});
export type AdminExamRow = z.infer<typeof AdminExamRowSchema>;

export const AdminExamListSchema = z.object({
  exams: z.array(AdminExamRowSchema),
  /** One instant for the whole list, so two rows cannot straddle a phase
   *  boundary and disagree. */
  serverTime: z.iso.datetime(),
});
export type AdminExamList = z.infer<typeof AdminExamListSchema>;

/** A course's lessons, for the coverage picker. Grouped by section because that
 *  is how he thinks about «الوحدة ١ ٢ ٣». */
export const ExamLessonPickerSchema = z.object({
  sections: z.array(
    z.object({
      sectionId: z.uuid(),
      title: z.string(),
      lessons: z.array(
        z.object({ lessonId: z.uuid(), title: z.string(), isPublished: z.boolean() }),
      ),
    }),
  ),
});
export type ExamLessonPicker = z.infer<typeof ExamLessonPickerSchema>;

/**
 * Duplicating an exam onto other courses — «كرر الامتحان ده على باقي الكورسات».
 *
 * His real rhythm is four courses, one per part, twice a month. This is that
 * rhythm as a BUTTON, deliberately not as a `UNIQUE(year, month, slot)`
 * constraint: a database that caps him at two exams a month refuses him a
 * make-up paper at 19:45 with a 23505 he cannot route around.
 *
 * Each target names its own lessons, because the parts do not line up.
 */
export const AdminExamDuplicateSchema = z
  .object({
    targets: z
      .array(
        z.object({
          courseId: z.uuid(),
          coveredLessonIds: z.array(z.uuid()).min(1).max(60),
          /** Optional per-course rename; defaults to the source exam's title. */
          title: z.string().trim().min(3).max(120).optional(),
        }),
      )
      .min(1)
      .max(10),
  })
  .strict();
export type AdminExamDuplicateInput = z.infer<typeof AdminExamDuplicateSchema>;

/**
 * Marking one ungraded answer.
 *
 * ⚠️ This closes a hole that has been open the whole time, not a new one this
 * feature opened. There is NO manual-grading route in the product today —
 * `AdminAttemptsController` exposes only reopen / extra-time / extra-attempt,
 * and `AttemptService.recomputeScore` + `recomputeScoreTx` exist with ZERO
 * callers. So an essay sits `needs_grading`, which is inside `GRADED_STATES`,
 * and scores 0 forever: the score is real to every aggregate on the platform
 * and wrong to the student.
 *
 * `mark` is clamped server-side to the slot's own `max_mark` — an admin typing
 * 20 into a 5-mark question is a slip, not an instruction.
 */
export const AdminGradeAnswerSchema = z
  .object({
    mark: z.number().min(0),
    /** Sanitised server-side like every other rich-text write. */
    feedbackHtml: z.string().max(20000).optional(),
  })
  .strict();
export type AdminGradeAnswerInput = z.infer<typeof AdminGradeAnswerSchema>;

/** One answer waiting on a human. */
export const AdminGradingRowSchema = z.object({
  attemptQuestionId: z.uuid(),
  slotPosition: z.number().int().nonnegative(),
  questionHtml: z.string(),
  /** What the student wrote. Null when they left it blank — and a blank essay
   *  still needs a human to write the zero, because `gradeQuestion` never
   *  auto-grades this type. */
  responseText: z.string().nullable(),
  maxMark: z.number(),
  /** Null until someone marks it. Never 0 — the difference between "unmarked"
   *  and "marked zero" is the whole reason this screen exists. */
  mark: z.number().nullable(),
  feedbackHtml: z.string().nullable(),
});

export const AdminGradingAttemptSchema = z.object({
  attemptId: z.uuid(),
  studentName: z.string(),
  quizTitle: z.string(),
  submittedAt: z.iso.datetime().nullable(),
  gradeOutOf: z.number(),
  /** The score as it stands RIGHT NOW, with every unmarked answer counting
   *  zero. Shown beside the questions so it is obvious what marking will move. */
  scaledScore: z.number().nullable(),
  questions: z.array(AdminGradingRowSchema),
});
export type AdminGradingAttempt = z.infer<typeof AdminGradingAttemptSchema>;

/** The queue — «ورقات محتاجة تصحيح». Without it he has no way to FIND them. */
export const AdminGradingQueueSchema = z.object({
  rows: z.array(
    z.object({
      attemptId: z.uuid(),
      studentName: z.string(),
      quizTitle: z.string(),
      lessonId: z.uuid(),
      submittedAt: z.iso.datetime().nullable(),
      pendingCount: z.number().int().positive(),
    }),
  ),
});
export type AdminGradingQueue = z.infer<typeof AdminGradingQueueSchema>;
