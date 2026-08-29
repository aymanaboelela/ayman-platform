import { z } from '@ayman/contracts/zod';
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
  /**
   * The lesson page this stop opens — `/courses/:slug/lessons/:lessonId`.
   *
   * Equal to `id` for an ordinary lesson node. A quiz can now hang off ANY
   * lesson kind, not just `kind: 'quiz'` (see `LessonPanel`'s admin-side
   * comment) — a bonus quiz attached to a video lecture, say. That quiz gets
   * its OWN stop on the map (own `id`, so it is a distinct React key and a
   * distinct thing a student can point at), but there is no separate lesson
   * page for it to open: pressing it has to land on the SAME video lesson
   * page its host lecture opens, which is what `lessonId` (not `id`) is for.
   */
  lessonId: z.string(),
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
  /**
   * What the course's ARTWORK is derived from — see `apps/web/lib/subject-art.ts`.
   *
   * `CourseRail` used to carry a note explaining that "this platform has no
   * per-course artwork and no field to hang one on", and that the only options
   * were an arbitrary glyph or none. That is no longer true: the dashboard and
   * the library both draw a generated scene per subject now, and this is the
   * field the path needs to draw the same one. Without it the same course wears
   * a mark on two screens and a bare ring on the third.
   *
   * The NAME rather than the id, because that is what every other payload
   * already carries (`EnrolledCourse`, `CatalogCourse`) and what the art is
   * keyed on. Widening this to an id would mean the web side holding two
   * lookups for one colour.
   */
  subjectNameAr: z.string(),
  /**
   * The uploaded cover, when the instructor has set one — the storage KEY,
   * never a URL, the same rule `Course.coverKey` and `EnrolledCourse` follow.
   *
   * It was missing on the first pass and `PathMap` passed a literal `null` in
   * its place, so a cover uploaded in the admin appeared on the dashboard and
   * in the library and NOWHERE on the path. Reported directly: «وأنا بكريت
   * الكورس عايز أحط له صورة والصورة تتحط هنا».
   *
   * The generated scene is the fallback, not the target — see
   * `apps/web/lib/subject-art.ts`. A real cover always wins.
   */
  coverKey: z.string().nullable(),
  /**
   * Is the course still published?
   *
   * `false` means the instructor has taken it down — usually for a few minutes,
   * to edit it — while this student is enrolled in it. It is the one field on
   * this payload that describes the COURSE rather than the student, and it
   * exists because the two alternatives were both worse:
   *
   *   · Omitting it (what shipped before) left every stop on the run a
   *     pressable link into a 404. `/courses/:slug/lessons/:id` refuses an
   *     unpublished course, that page redirects to `/library/:slug`, and the
   *     catalog — which is published-only — answers `notFound()`. So a student
   *     pressing their own next lesson landed on «الصفحة مش موجودة» with no
   *     idea why.
   *   · Filtering it out of the query would make a course they are enrolled in
   *     disappear from their learning path without a word — losing them the
   *     thing AND the explanation, which is the same bug wearing a hat.
   *
   * So it ships, the map keeps drawing the course, and the UI says «مقفول
   * مؤقتاً» and stops linking. Decided that way explicitly: «أيوه قول مقفول».
   *
   * ⚠️ NOT an access decision, and nothing may treat it as one.
   * `LessonAccessService` and `PlayerService` re-derive the refusal on every
   * request whatever this says. This exists only so the screen can explain a
   * refusal instead of walking a student into it.
   */
  published: z.boolean(),
  progressPercent: z.number().min(0).max(100),
  clearedLessons: z.number().int().min(0),
  totalLessons: z.number().int().min(0),
  /** Where "نبدأ من هنا" points. Null once the course is finished. */
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
