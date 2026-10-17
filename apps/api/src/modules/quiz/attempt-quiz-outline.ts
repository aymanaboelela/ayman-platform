import type { AttemptQuizKind } from '@ayman/contracts/admin/attempts';
import { isMonthlyExamLesson } from '@ayman/contracts/quiz/monthly-exam';
import { EXAM_SHELF_TITLE } from '@ayman/contracts/quiz/scheduled';

/**
 * Which quiz is which, for «محاولات الطلاب» — the two facts the flat list could
 * not say about a sitting: what kind of paper it was, and which lecture it
 * belongs to.
 *
 * Pure functions over rows the caller already holds, so the overview's one
 * outline read answers both for every quiz in a course at once.
 */

export interface OutlineLessonRow {
  id: string;
  kind: string;
  isPublished: boolean;
}

export interface OutlineSectionRow {
  title: string;
  isPublished: boolean;
  /** In reading order — `position`, then `id`. */
  lessons: readonly OutlineLessonRow[];
}

/**
 * Course exam, monthly exam, or a lecture's quiz.
 *
 * The course exam first: it is named by `courses.exam_lesson_id`, wherever it
 * sits. Then the shelf rule, through the shared predicate (`kind` AND the
 * shelf — a lecture somebody parked on the shelf is still a lecture). A quiz
 * attached straight to a video lecture is that lecture's quiz.
 */
export function attemptQuizKind(
  lesson: { id: string; kind: string },
  sectionTitle: string,
  examLessonId: string | null,
): AttemptQuizKind {
  if (lesson.id === examLessonId) return 'course_exam';
  if (isMonthlyExamLesson(lesson.kind, sectionTitle)) return 'monthly_exam';
  return 'lecture_quiz';
}

/**
 * «المحاضرة ٣» for every lesson that has a number, keyed by lesson id.
 *
 * ## The number a STUDENT sees, not a fresh count
 *
 * `buildCourseOutline` (apps/web/lib/course-outline.ts) numbers the student's
 * outline, and that number is the one a teacher and a class say out loud. So
 * this reproduces its rule rather than inventing a second one:
 *
 *   · the counter runs across the WHOLE course, never restarting per unit;
 *   · it counts only what a student can see — a published lesson in a
 *     published unit, and never the «امتحانات الشهر» shelf, which the catalogue
 *     leaves out entirely;
 *   · a quiz takes the number of the lecture it CHECKS: the nearest lesson
 *     before it in the same unit (`groupIntoEntries`' adjacency rule, the one
 *     `resolveGate` also uses), and does not move the counter;
 *   · a quiz with nothing before it in its unit stands on its own and takes a
 *     number, exactly as the student outline lets it.
 *
 * Adjacency is read over ALL of a unit's lessons, published or not, so a
 * quiz under an unpublished lecture maps to that lecture — which has no
 * number, so the quiz has none either. That is the honest answer: students
 * see no «المحاضرة N» there to match it to.
 *
 * A lesson the map has no entry for has no number.
 */
export function lectureNumbers(
  sections: readonly OutlineSectionRow[],
  examLessonId: string | null,
): Map<string, number> {
  const numbers = new Map<string, number>();
  let counter = 0;

  for (const section of sections) {
    const counted = section.isPublished && section.title !== EXAM_SHELF_TITLE;
    // The lecture a following quiz belongs to, within THIS unit only: an
    // ownerless quiz at the top of a unit never reaches back into the last one.
    let owner: { number: number | null } | null = null;

    for (const lesson of section.lessons) {
      const visible = counted && lesson.isPublished;
      const isLectureQuiz = lesson.kind === 'quiz' && lesson.id !== examLessonId;

      if (isLectureQuiz && owner) {
        if (owner.number !== null) numbers.set(lesson.id, owner.number);
        continue;
      }

      // A lecture, the course exam, or an ownerless quiz: each is a row of its
      // own in the student outline, and the visible ones move the counter.
      const number = visible ? ++counter : null;
      if (number !== null) numbers.set(lesson.id, number);
      owner = { number };
    }
  }

  return numbers;
}
