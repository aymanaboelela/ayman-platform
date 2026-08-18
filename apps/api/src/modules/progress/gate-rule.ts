/**
 * The progression rule, as a pure function over already-fetched data.
 *
 * Pure on purpose: this is the single sentence that decides what a student may
 * open, and it deserves an exhaustive test table rather than a database
 * fixture per case. `LessonGateService` does the I/O and calls this.
 */

/** Cleared = the student is done with it. Identical to the predicate
 *  `CourseProgressService.recalculate` counts, so "the progress bar moved" and
 *  "the course finished" can never disagree. */
export const CLEARED_STATES = ['completed', 'passed'] as const;

export type GateState = 'cleared' | 'available' | 'locked';

export interface GateLesson {
  id: string;
  /** `LessonProgress.state`, or 'not_started' when there is no row yet. */
  state: string;
  /** `Lesson.kind`. Only `quiz` is treated specially — see `isLecture`. */
  kind: string;
}

/**
 * Whether this lesson is a LECTURE — a step of the course rather than a check
 * on one.
 *
 * The only thing this still decides is the exam's prerequisite set. A quiz is
 * excluded from it because a quiz gets one sitting and `failed` is not a
 * cleared state, so counting quizzes would mean one under-par score shutting
 * the final exam forever with no action the student could take to reopen it.
 * Measured on production 2026-08-17, three of the six students who had sat the
 * second lecture's quiz were stopped by exactly that.
 */
function isLecture(lesson: GateLesson): boolean {
  return lesson.kind !== 'quiz';
}

export interface GateInput {
  /**
   * Every PUBLISHED lesson of the course, in reading order — section position,
   * then lesson position, then id. The exam, if there is one, is in here too;
   * it is an ordinary lesson.
   */
  lessons: readonly GateLesson[];
  /** `Course.examLessonId`. Null when the course has no exam. */
  examLessonId: string | null;
}

export function isCleared(state: string): boolean {
  return (CLEARED_STATES as readonly string[]).includes(state);
}

/**
 * Resolves every lesson of one course for one student, in one pass.
 *
 * The rules, in the order they apply:
 *
 *   1. Already cleared → `cleared`, whatever else is true.
 *   2. The EXAM is available only when every other published LECTURE is
 *      cleared. This is the one rule left that reads more than the lesson in
 *      front of it, and it is why `examLessonId` is a column rather than a
 *      convention about position.
 *   3. Everything else → `available`.
 *
 * ## Why there is no chain any more
 *
 * Rule 3 used to be "available iff the immediately preceding lesson is
 * cleared", behind a per-course `progressionMode`. Every course on the
 * platform ran it, and it is gone — column, enum and all.
 *
 * It was not doing the job it looks like it does. What a release gate is FOR
 * is pacing content that arrives weekly; what this one actually did was refuse
 * to open lecture 3 to a student who had watched lecture 2 without pressing
 * «خلاص · التالي» — because the chain reads `LessonProgress.state`, which is a
 * record of a button, not of a person watching a video. So the student who had
 * genuinely done the work and the student who had not were shown the identical
 * padlock, and the padlock's own dialog then pointed at the lecture they were
 * already sitting on. «أي حد يقدر يشوف أي حلقة عادي من الكورس، مش شرط يبقى شاف
 * اللي قبلها.»
 *
 * Nothing was protecting anything, either. Ordering is already carried by the
 * outline: the course reads top to bottom, «نبدأ من هنا» points at the next
 * lesson, and every row now states whether the student has watched it (see
 * `library.lessonNew` and its neighbours) — which is the part they were
 * actually missing. And every graded sitting on this platform is entered
 * through `<ExamGateDialog>`, which states in words that the paper is one
 * sitting, timed and permanently recorded, before a single question is drawn.
 * A student cannot burn a quiz by wandering into it.
 *
 * ## Why the exam is the one thing left closed
 *
 * It is the course's terminal assessment: passing it is what completes the
 * course, and "the final exam opens when you finish the course" is a rule
 * students expect rather than one they read as a bug. Removing it would let a
 * student spend their single sitting on day one, before any lecture existed to
 * study from — the one failure here that cannot be undone by pressing play.
 */
export function resolveGate(input: GateInput): Map<string, GateState> {
  const result = new Map<string, GateState>();

  /**
   * Every other LECTURE cleared — quizzes excluded, per `isLecture`.
   *
   * `exceptId` is the exam itself: a course whose exam is its only lesson has
   * an empty prerequisite set, so `every` is vacuously true and the exam opens.
   * That is correct — there is nothing left to do first.
   */
  const everyLectureCleared = (exceptId: string): boolean =>
    input.lessons.every(
      (lesson) => lesson.id === exceptId || !isLecture(lesson) || isCleared(lesson.state),
    );

  for (const lesson of input.lessons) {
    if (isCleared(lesson.state)) {
      result.set(lesson.id, 'cleared');
      continue;
    }

    if (lesson.id === input.examLessonId) {
      result.set(lesson.id, everyLectureCleared(lesson.id) ? 'available' : 'locked');
      continue;
    }

    result.set(lesson.id, 'available');
  }

  return result;
}
