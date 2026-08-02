import { z } from 'zod';
// The PACKAGE SUBPATH, never `./progress` — `apps/api` imports this module and
// Node's native ESM loader cannot resolve an extensionless relative specifier
// at real runtime. See the same note at the head of `content.ts`.
import { GateStateSchema, LessonProgressStateSchema } from '@ayman/contracts/progress';

/**
 * One stop on the map. Deliberately thin: the map draws state, it does not
 * re-derive it, and everything here was computed by the same resolver the
 * lesson routes enforce.
 */
export const PathNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(['video', 'quiz', 'attachment', 'text']),
  /** What the student DID. */
  state: LessonProgressStateSchema,
  /** What they MAY do — cleared / available / locked. */
  gate: GateStateSchema,
  isExam: z.boolean(),
});

export const PathCourseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  progressPercent: z.number().min(0).max(100),
  clearedLessons: z.number().int().min(0),
  totalLessons: z.number().int().min(0),
  /** Where "ابدأ من هنا" points. Null once the course is finished. */
  nextLessonId: z.string().nullable(),
  nodes: z.array(PathNodeSchema),
});

export const LearningPathSchema = z.object({
  courses: z.array(PathCourseSchema),
  /** The course the map opens on: the first with anything left to do. */
  currentCourseId: z.string().nullable(),
  clearedLessons: z.number().int().min(0),
  totalLessons: z.number().int().min(0),
  /**
   * Cleared ÷ total across EVERY enrolled course, not the mean of the
   * per-course percentages — a student two lessons into a 40-lesson course and
   * done with a 2-lesson one is 10% through, not 52%.
   */
  percent: z.number().min(0).max(100),
});

export type PathNode = z.infer<typeof PathNodeSchema>;
export type PathCourse = z.infer<typeof PathCourseSchema>;
export type LearningPath = z.infer<typeof LearningPathSchema>;
