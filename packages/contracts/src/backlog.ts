import { z } from '@ayman/contracts/zod';

/**
 * «المتراكم عليّا» — everything a student could do right now and hasn't:
 * lectures not finished, quizzes never sat, homework never handed in (or sent
 * back for another go).
 *
 * A READ of what the path already decided, never a second decision. Every row
 * here is a lesson whose gate `LessonGateService` resolved as `available` —
 * the same resolver the lesson routes enforce — so nothing on this screen can
 * be a door that 404s. A month the student did not buy is `locked` there and
 * therefore simply absent here: it is not «متراكم», it is not theirs.
 */
export const BacklogItemKindSchema = z.enum(['lecture', 'quiz', 'exam', 'homework']);

export const BacklogItemSchema = z.object({
  /** Unique per row: a lecture and its homework share a `lessonId`. */
  id: z.string(),
  kind: BacklogItemKindSchema,
  /** The lesson page the row's button opens. */
  lessonId: z.string(),
  title: z.string(),
  courseId: z.string(),
  courseSlug: z.string(),
  courseTitle: z.string(),
  /**
   * `in_progress` — started and left: a half-watched lecture, an open quiz
   * attempt. `redo` — homework he sent back («محتاج تعديل»). `not_started`
   * otherwise.
   */
  status: z.enum(['not_started', 'in_progress', 'redo']),
});

export const BacklogCourseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  /** Keys the generated artwork, same as `PathCourse.subjectNameAr`. */
  subjectNameAr: z.string(),
  coverKey: z.string().nullable(),
  items: z.array(BacklogItemSchema),
});

export const StudentBacklogSchema = z.object({
  /** Only courses with something on them, in enrolment order. */
  courses: z.array(BacklogCourseSchema),
  counts: z.object({
    lectures: z.number().int().min(0),
    /** Quizzes AND the final exam — both are a sitting waiting to be taken. */
    quizzes: z.number().int().min(0),
    homework: z.number().int().min(0),
    /**
     * Homework handed in and not marked yet. NOT backlog — the ball is in the
     * teacher's court — but a student staring at «٠ واجبات» while three sit
     * in the queue would think they were lost.
     */
    awaitingReview: z.number().int().min(0),
  }),
});

export type BacklogItemKind = z.infer<typeof BacklogItemKindSchema>;
export type BacklogItem = z.infer<typeof BacklogItemSchema>;
export type BacklogCourse = z.infer<typeof BacklogCourseSchema>;
export type StudentBacklog = z.infer<typeof StudentBacklogSchema>;
