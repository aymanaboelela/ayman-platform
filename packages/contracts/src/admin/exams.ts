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
  /** Whose paper it is, as an ACCOUNT — so the name at the top of the marking
   *  screen is a way into their record, which is where the conversation with
   *  them lives. «أضغط عليها أروح البروفايل بتاعها». */
  studentUserId: z.string(),
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
      /**
       * Who wrote it, as an ACCOUNT and not only a name.
       *
       * The queue named the student and stopped there, so the one question the
       * screen provokes — "who is this, and can I say something to them" — had
       * no answer on it: the name had to be copied into `/admin/students`
       * and searched for. Every row is now a link to that person's record,
       * which is where the conversation with them lives.
       */
      studentUserId: z.string(),
      studentName: z.string(),
      quizTitle: z.string(),
      lessonId: z.uuid(),
      submittedAt: z.iso.datetime().nullable(),
      pendingCount: z.number().int().positive(),
      /** How many MARKS are riding on those questions, out of the paper's
       *  total. «٢ سؤال» does not say whether this is worth two marks or
       *  fifty, and on a midterm it is fifty. */
      pendingMarks: z.number(),
      gradeOutOf: z.number(),
    }),
  ),
});
export type AdminGradingQueue = z.infer<typeof AdminGradingQueueSchema>;

/**
 * ── «اتصحّح خلاص» و«الأوائل» ─────────────────────────────────────────────────
 *
 * The two sections the grading screen was missing. Marking a paper made it
 * vanish off the queue and turn up nowhere — «تروح التصحيح بتاعته لمكان تاني
 * للناس اللي تصحح لهم ودرجات كل الناس» — so there was no way to check a mark
 * you had just given, revise it, or see how the cohort actually did.
 *
 * One row shape serves both, because they are the same fact ordered two ways:
 * a finished sitting, who sat it, and what it came to.
 */
export const GRADING_SORTS = ['score', 'fastest', 'latest', 'earliest', 'name'] as const;
export const GradingSortSchema = z.enum(GRADING_SORTS);
export type GradingSort = (typeof GRADING_SORTS)[number];

/** `marked` — papers a human actually marked. `all` — every finished sitting,
 *  which is what a ranking has to be drawn from. */
/** `late` — «اللي امتحنوا بعد الميعاد», on their own. They are graded like
 *  anybody else and they are not in the running, so they get their own view
 *  rather than a badge inside a ranking they do not belong to — and `all`
 *  EXCLUDES them for the same reason. */
export const GRADING_SCOPES = ['marked', 'all', 'late'] as const;
export const GradingScopeSchema = z.enum(GRADING_SCOPES);
export type GradingScope = (typeof GRADING_SCOPES)[number];

export const AdminGradedRowSchema = z.object({
  attemptId: z.uuid(),
  studentUserId: z.string(),
  studentName: z.string(),
  quizTitle: z.string(),
  lessonId: z.uuid(),
  submittedAt: z.iso.datetime().nullable(),
  /**
   * Start to submit, in seconds — «أشوف مين أسرع حد».
   *
   * Computed from the attempt's OWN `started_at`/`submitted_at` and not from
   * the quiz's duration: a paper can be resumed, and the figure that means
   * something is how long this person actually took. Null on a sitting with no
   * submission stamp (an abandoned one), which is also why it is nullable
   * rather than 0 — «٠ ثانية» would sort to the top of «الأسرع».
   */
  durationSeconds: z.number().int().nonnegative().nullable(),
  scaledScore: z.number().nullable(),
  gradeOutOf: z.number(),
  /** `scaledScore / gradeOutOf`, server-side, so the ranking compares two
   *  papers marked out of different totals correctly. */
  percent: z.number().min(0).max(100).nullable(),
  passed: z.boolean().nullable(),
  /** Whether a human marked at least one answer on this paper — what puts it
   *  in «اتصحّح خلاص» rather than merely in the ranking. */
  handMarked: z.boolean(),
  /** The instructor's own 1..5 on this paper, or null. The tiebreak between
   *  ten students who all scored full marks. */
  instructorRating: z.number().int().min(1).max(5).nullable(),
  /** Whether this paper is on «لوحة الشرف» — and so whether this student's
   *  name and photo are on the public landing page right now. */
  onHonorBoard: z.boolean(),
  /**
   * Whether this sitting STARTED after the exam's real deadline
   * (`quizzes.late_after`).
   *
   * «هنصحّح بس مش هياخد جايزة»: a late paper is marked like any other and the
   * student sees their grade, but it is kept out of «الأوائل» and refused a
   * place on the honour board.
   */
  isLate: z.boolean(),
});
export type AdminGradedRow = z.infer<typeof AdminGradedRowSchema>;

/**
 * «كام واحد دخل، كام جاب ١٠٠، كام رسب» — the four numbers above the list.
 *
 * Computed over the SAME filtered set the rows come from, so switching to one
 * exam or one day changes them. A summary that silently described the whole
 * platform while the list below it showed one day would be worse than none.
 */
export const AdminGradingStatsSchema = z.object({
  /** Finished sittings in the current filter — «كام واحد دخل الامتحان». */
  sat: z.number().int().nonnegative(),
  /** Full marks. Counted on the MARK, not on 100% — a paper marked out of 50
   *  that scored 50 is a full mark too. */
  perfect: z.number().int().nonnegative(),
  /** Below the paper's own pass mark. `passed` is null on nothing here: the
   *  list is `submitted` only, so every row has a verdict. */
  failed: z.number().int().nonnegative(),
  /** Mean percentage, rounded. `null` when nothing is in the filter — never 0,
   *  which would read as "everyone scored zero". */
  averagePercent: z.number().min(0).max(100).nullable(),
});
export type AdminGradingStats = z.infer<typeof AdminGradingStatsSchema>;

/** One day that has finished sittings on it — «النهاردة بس حط امتحان واحد».
 *  Days with nothing in them are not offered, so the filter can never lead to
 *  an empty screen. */
export const AdminGradingDaySchema = z.object({
  /** `YYYY-MM-DD` in CAIRO, not UTC. A paper submitted at 00:30 Cairo belongs
   *  to that night in every sentence anyone says about it, and bucketing on
   *  UTC would file it under the previous day. */
  day: z.string(),
  count: z.number().int().positive(),
});
export type AdminGradingDay = z.infer<typeof AdminGradingDaySchema>;

export const AdminGradingResultsSchema = z.object({
  rows: z.array(AdminGradedRowSchema),
  /** Every exam with at least one finished sitting — the filter's options,
   *  sent with the rows so the control never needs a second request. */
  exams: z.array(z.object({ lessonId: z.uuid(), title: z.string() })),
  /** The days that have sittings, newest first — the left-hand filter. */
  days: z.array(AdminGradingDaySchema),
  stats: AdminGradingStatsSchema,
});
export type AdminGradingResults = z.infer<typeof AdminGradingResultsSchema>;

/**
 * `PATCH /api/admin/attempts/:attemptId/mark` — «أقيّمه» و«حطه في لوحة الشرف».
 *
 * Both fields are optional and independent: rating a paper does not put it on
 * the board, and putting it on the board does not require a rating. Sending
 * neither is a 400 rather than a silent no-op.
 */
export const AdminAttemptMarkSchema = z
  .object({
    /** 1..5, or null to clear. Matches the CHECK on the column. */
    instructorRating: z.number().int().min(1).max(5).nullable().optional(),
    /** ⚠️ True publishes this student's NAME AND AVATAR on the public landing
     *  page. It is a boolean here rather than a timestamp so the caller cannot
     *  backdate the board; the server stamps `now()`. */
    onHonorBoard: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => value.instructorRating !== undefined || value.onHonorBoard !== undefined,
    { message: 'مفيش حاجة تتغيّر' },
  );
export type AdminAttemptMarkInput = z.infer<typeof AdminAttemptMarkSchema>;

/**
 * لوحة الشرف — the public board on the landing page.
 *
 * ## What is and is not on the wire
 *
 * A name, a photograph, the exam, and the mark. NOTHING that identifies the
 * account behind it: no user id, no attempt id, no slug. This is the one
 * payload on the platform that is read by anyone on the internet and describes
 * a named minor, so it carries the least that still makes a board — and an id
 * on it would let a stranger enumerate students from the landing page.
 *
 * ## Why the board is stored, not derived
 *
 * Every entry is here because an instructor put it here (`honor_board_at`).
 * A board that filled itself from the top scores would publish a child's
 * photograph because they did well on a quiz — see the column's own note.
 */
export const HonorBoardEntrySchema = z.object({
  studentName: z.string(),
  /** The avatar's storage key, or null. The PUBLIC board declines to render
   *  it — see `honor-board-section.tsx` — and it stays on the wire only so an
   *  instructor surface can tell whose row this is. */
  avatarKey: z.string().nullable(),
  /**
   * صورة لوحة الشرف — the photo the board DOES render, or null.
   *
   * A different fact from `avatarKey` above, which is why both are here. The
   * avatar is the student's own (a Google photo, a selfie for a screen only
   * they see); this one is set by an instructor FOR this board, one student at
   * a time, and it is the only thing that puts a face on a public page beside
   * a minor's name. `student_profiles.honor_photo_key` carries the full
   * argument.
   *
   * Null is the normal case and is not a gap: the card falls back to initials,
   * which is what every card showed before photos existed at all.
   */
  photoKey: z.string().nullable(),
  /**
   * السطر اللي تحت الاسم على الكارت.
   *
   * كان اسمه `quizTitle` وهو عنوان الامتحان، وده لسه صح للورقة المثبّتة.
   * بس اللوحة بقى فيها صف بيتحط بالإيد كمان (`honor_board_pins`) ومالوش
   * امتحان أصلاً — «الأول على الدفعة»، «انتظام كامل» — فاسم الحقل بقى
   * بيكذب على نص اللوحة. ده نفس المكان على الكارت، باسم بيوصف مكانه مش
   * مصدره.
   */
  title: z.string(),
  /** Which course this place was won in — «تانية بكالوريا — لغات».
   *
   *  The board runs ONE RACE PER COURSE, not one race overall, so `rank`
   *  below is meaningless without it: four cards reading الأول/التاني/التالت/
   *  الرابع would claim a تانية-لغات student beat an أولى-عربي one, and they
   *  never sat the same paper. This is a LABEL and not the course's id or
   *  slug, for the reason in this block's header. */
  courseLabel: z.string(),
  /** 1-based WITHIN `courseLabel`, never across the board. Two entries on the
   *  same board are both `rank: 1` when they are firsts of different courses,
   *  and that is the intended reading. */
  rank: z.number().int().min(1),
  /**
   * الدرجة — أو `null` على الصف اللي اتحط بالإيد.
   *
   * التلاتة دول بيجوا من ورقة اتصحّحت، والتكريم اليدوي مالوش ورقة: «الأول
   * على الدفعة» مالهاش ٤٧ من ٥٠. صفر هنا كان هيتقري «جاب صفر»، فالغياب
   * بيتقال `null` والكارت بيسيب الخانة فاضية بدل ما يخترع رقم.
   *
   * ⚠️ التلاتة بيغيبوا مع بعض أو بيبقوا موجودين مع بعض. أي كارت بيقرا
   * `percent` لازم يتعامل مع `null` — بريست «الترمينال» بيطبع
   * `scaledScore/gradeOutOf` وبيخفي السطر كله لما ما يكونش فيه درجة.
   */
  scaledScore: z.number().nullable(),
  gradeOutOf: z.number().nullable(),
  percent: z.number().min(0).max(100).nullable(),
});
export type HonorBoardEntry = z.infer<typeof HonorBoardEntrySchema>;

/**
 * One round of the board — «الناس اللي كانت وقتها في لوحة الشرف».
 *
 * ## Why the round is the day it was PINNED
 *
 * There is no stored "round" column, and the obvious substitutes do not work:
 * the two courses sit different exam lessons with different titles («امتحان
 * نص الشهر الأول» and «Mid-Month Exam 1»), so a round cannot be a lesson id,
 * and `opensAt` is null on an exam that was simply left open. What the four
 * winners of a round DO share is that one instructor pinned them in one
 * sitting, so the round is the Cairo date of `honor_board_at`.
 *
 * The cost is honest and small: pinning a fifth name a day later files it as
 * its own round. Unpinning and re-pinning it moves it back, which is two
 * clicks on a screen the instructor is already on.
 *
 * ## والصف اللي بالإيد بيختار يومه
 *
 * `honor_board_pins.honored_at` بيتكتب من الشاشة، مش `now()` — وده الفرق
 * الوحيد. بيتبوّب بنفس التوقيت المصري، فتكريم يدوي على نفس يوم الورقة
 * المثبّتة بيقع في نفس الدور بالظبط، وده اللي بيخلّي «كمّل الدور بواحد
 * تاني» ممكنة من غير ما يتفك ويترجّع.
 */
export const HonorBoardPeriodSchema = z.object({
  /** `YYYY-MM-DD`, bucketed in CAIRO — a board pinned at 00:30 Cairo belongs
   *  to that night in every sentence anyone says about it. */
  key: z.string(),
  /** The newest pin in the round, so the archive can print a real date. */
  pinnedAt: z.iso.datetime(),
  /** اللي الدور ده اتكرّم عليه، من غير تكرار وبترتيب الكروت — عنوان امتحان
   *  للورقة المثبّتة، وسبب التكريم للصف اللي اتحط بالإيد. كان `examTitles`،
   *  واتغيّر لنفس سبب `title` فوق: مش كل صف عليه ورا امتحان. */
  titles: z.array(z.string()),
  entries: z.array(HonorBoardEntrySchema),
});
export type HonorBoardPeriod = z.infer<typeof HonorBoardPeriodSchema>;

export const HonorBoardSchema = z.object({
  /** The CURRENT board — the newest round, flat. This is what the landing
   *  page renders, and it stays a top-level field so that section never has
   *  to know the archive exists. */
  entries: z.array(HonorBoardEntrySchema),
  /** Every round, newest first. Drives «عرض الكل». */
  periods: z.array(HonorBoardPeriodSchema),
});
export type HonorBoard = z.infer<typeof HonorBoardSchema>;

