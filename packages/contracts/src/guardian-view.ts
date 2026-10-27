import { z } from '@ayman/contracts/zod';
// Package subpaths, never `./progress` — `apps/api` imports this module and
// Node's native ESM loader cannot resolve an extensionless relative specifier.
import { HonorStandingSchema } from '@ayman/contracts/progress';
import { QuizHistoryPointSchema } from '@ayman/contracts/quiz/history';

/**
 * `GET /api/guardian/me` — everything the parent's page shows, in ONE read.
 *
 * ## One payload, every number from the screen the student already trusts
 *
 * A parent and a student looking at two numbers for the same thing is the
 * failure this page cannot afford: the conversation at home is about the
 * number, and nobody in it can audit the arithmetic. So every block below names
 * the service the student's OWN screen reads, and the guardian report calls it
 * rather than re-deriving it:
 *
 *   · lectures per course — `DashboardService.forUser` («كورساتي»), which counts
 *     only the months the student holds;
 *   · backlog and homework — `BacklogService` over `PathService` («المتراكم»),
 *     the same gate the lesson routes enforce;
 *   · subscription — `hasLiveCourseAccess` (`grant-liveness.ts`), the predicate
 *     `GET /api/enrollments` and `EntitlementService` share — never the
 *     enrollment row, which stays `active` forever;
 *   · quiz and exam averages — the per-quiz best FINAL mark, the rule
 *     `CohortRankService` («ترتيبي») ranks on;
 *   · rank, certificates, weak topics, centre attendance — their own services.
 *
 * ## Nothing about anyone else
 *
 * The rank block carries the student's own place and nothing of the podium or
 * the ladder the student's `/rank` page draws: other students' names are a
 * student-to-student courtesy, not something a parent's session may read.
 */

/** `null` = the block does not exist on this stack, or for this student —
 *  never "zero". The page hides a null block; it draws an empty one. */

export const GuardianAccessSchema = z.object({
  /**
   * `active` — a live grant opens the course today.
   * `codes`  — no subscription, but unlock codes open some lectures.
   * `ended`  — nothing live: the subscription lapsed, or was never bought.
   */
  state: z.enum(['active', 'codes', 'ended']),
  /** The widest live grant: the whole course, the term, or a set of months. */
  plan: z.enum(['full', 'term', 'months']).nullable(),
  /** The month titles held, in curriculum order — only when `plan` is `months`. */
  months: z.array(z.string()),
  /** When the live access ends. `null` = no end date on the grant (a term
   *  closes when the teacher closes it; a month grant has no date at all). */
  validUntil: z.iso.datetime().nullable(),
});
export type GuardianAccess = z.infer<typeof GuardianAccessSchema>;

export const GuardianCourseSchema = z.object({
  id: z.string(),
  title: z.string(),
  subjectNameAr: z.string(),
  coverKey: z.string().nullable(),
  /** `false` while the teacher has the course down for an edit. */
  published: z.boolean(),
  access: GuardianAccessSchema,
  lectures: z.object({
    /** Watched / total published — in the months the student holds. */
    completed: z.number().int().min(0),
    total: z.number().int().min(0),
    percent: z.number().min(0).max(100),
  }),
  /** Open, not yet done — the «المتراكم» counts for this course. */
  backlog: z.object({
    lectures: z.number().int().min(0),
    quizzes: z.number().int().min(0),
    homework: z.number().int().min(0),
  }),
  quizzes: z.object({
    taken: z.number().int().min(0),
    average: z.number().min(0).max(100).nullable(),
  }),
  exams: z.object({
    taken: z.number().int().min(0),
    average: z.number().min(0).max(100).nullable(),
  }),
  lastActivityAt: z.iso.datetime().nullable(),
});
export type GuardianCourse = z.infer<typeof GuardianCourseSchema>;

export const GuardianHomeworkStatusSchema = z.enum(['accepted', 'submitted', 'needs_work', 'missing']);
export type GuardianHomeworkStatus = z.infer<typeof GuardianHomeworkStatusSchema>;

export const GuardianHomeworkItemSchema = z.object({
  lessonId: z.string(),
  lessonTitle: z.string(),
  courseId: z.string(),
  courseTitle: z.string(),
  /**
   * `missing` only on a lecture the student can open today. A submission on a
   * lecture that has since closed (a lapsed month) is still listed with its
   * real status — it happened — but a closed lecture is never "owed".
   */
  status: GuardianHomeworkStatusSchema,
  submittedAt: z.iso.datetime().nullable(),
  /** The teacher's mark on an accepted answer, 0–100, when one was given. */
  grade: z.number().min(0).max(100).nullable(),
});
export type GuardianHomeworkItem = z.infer<typeof GuardianHomeworkItemSchema>;

/** `quiz` — a lecture's check. `monthly` — «امتحان الشهر» on its own shelf.
 *  `final` — the course exam. */
export const GuardianPaperKindSchema = z.enum(['quiz', 'monthly', 'final']);
export type GuardianPaperKind = z.infer<typeof GuardianPaperKindSchema>;

export const GuardianPaperSchema = z.object({
  /** The quiz's lesson — one row per quiz, however many sittings. */
  lessonId: z.string(),
  title: z.string(),
  courseId: z.string(),
  courseTitle: z.string(),
  kind: GuardianPaperKindSchema,
  /**
   * The best FINAL sitting — `null` when no sitting has been fully marked yet.
   * An improvement paper (تحسين) is a second sitting of the same quiz, so it
   * never makes a second row: the higher mark is the one that counts.
   */
  result: z
    .object({
      score: z.number().min(0),
      outOf: z.number().min(0),
      percent: z.number().min(0).max(100),
      /** The engine's own verdict, against the pass mark the quiz had when it
       *  was sat — never a default. */
      passed: z.boolean(),
    })
    .nullable(),
  /**
   * A sitting an essay of which is still with the teacher. The marked part is
   * reported out of what the marked part is worth (`gradedOutOf`), and the rest
   * as an amount still coming — a paper nobody has finished reading is never a
   * low mark. See `apps/api/src/modules/quiz/grading/mark-split.ts`.
   */
  pending: z
    .object({
      gradedScore: z.number().min(0),
      gradedOutOf: z.number().min(0),
      pendingOutOf: z.number().min(0),
    })
    .nullable(),
  sittings: z.number().int().min(1),
  lastSubmittedAt: z.iso.datetime(),
});
export type GuardianPaper = z.infer<typeof GuardianPaperSchema>;

export const GuardianBacklogItemSchema = z.object({
  courseId: z.string(),
  courseTitle: z.string(),
  kind: z.enum(['lecture', 'quiz', 'exam']),
  title: z.string(),
});

export const GuardianViewSchema = z.object({
  student: z.object({
    name: z.string(),
    /** «الصف الثاني بكالوريا» — the stack's own year label, when known. */
    yearLabel: z.string().nullable(),
    trackLabel: z.string().nullable(),
  }),
  /** The last thing the student did anywhere on the platform. */
  lastActivityAt: z.iso.datetime().nullable(),
  week: z.object({
    /** Lectures completed in the last seven days. */
    lecturesDone: z.number().int().min(0),
    /** …out of those plus the ones still open and not done. */
    lecturesOpen: z.number().int().min(0),
    quizzesSat: z.number().int().min(0),
    homeworkHandedIn: z.number().int().min(0),
  }),
  courses: z.array(GuardianCourseSchema),
  backlog: z.object({
    lectures: z.number().int().min(0),
    quizzes: z.number().int().min(0),
    homework: z.number().int().min(0),
    /** The first few open items, for «محتاج متابعة». */
    items: z.array(GuardianBacklogItemSchema),
  }),
  /** `null` when homework is switched off on this stack. */
  homework: z
    .object({
      accepted: z.number().int().min(0),
      submitted: z.number().int().min(0),
      needsWork: z.number().int().min(0),
      missing: z.number().int().min(0),
      items: z.array(GuardianHomeworkItemSchema),
    })
    .nullable(),
  quizzes: z.object({
    quizzes: z.object({
      taken: z.number().int().min(0),
      average: z.number().min(0).max(100).nullable(),
    }),
    exams: z.object({
      taken: z.number().int().min(0),
      average: z.number().min(0).max(100).nullable(),
    }),
    passed: z.number().int().min(0),
    failed: z.number().int().min(0),
    /** Quizzes whose only sittings are still being marked. */
    pending: z.number().int().min(0),
    /** Fully-marked sittings, oldest first — the trend line. Same point shape
     *  as the student's own «نتايجي» chart. */
    series: z.array(QuizHistoryPointSchema),
    papers: z.array(GuardianPaperSchema),
  }),
  rank: z
    .object({
      cohortLabel: z.string(),
      rank: z.number().int().min(1).nullable(),
      betterThanPercent: z.number().min(0).max(100).nullable(),
      points: z.number().int().min(0),
    })
    .nullable(),
  honorBoard: HonorStandingSchema.nullable(),
  /** `null` when certificates are not open on this stack. */
  certificates: z
    .object({
      minPercent: z.number(),
      units: z.array(
        z.object({ id: z.string(), title: z.string(), courseTitle: z.string(), earnedAt: z.iso.datetime() }),
      ),
      exams: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          courseTitle: z.string(),
          percent: z.number().min(0).max(100),
          earnedAt: z.iso.datetime(),
        }),
      ),
    })
    .nullable(),
  /** The lectures with the most questions still answered wrong — `null` when
   *  the mistakes notebook is closed on this stack. */
  weakTopics: z
    .array(z.object({ title: z.string(), courseTitle: z.string().nullable(), mistakes: z.number().int().min(1) }))
    .nullable(),
  /** `null` for a student who has never been booked into a centre. */
  attendance: z
    .object({
      centerName: z.string().nullable(),
      attended: z.number().int().min(0),
      absent: z.number().int().min(0),
      recent: z.array(
        z.object({ date: z.string(), centerName: z.string(), status: z.enum(['present', 'absent']) }),
      ),
    })
    .nullable(),
});

export type GuardianView = z.infer<typeof GuardianViewSchema>;
