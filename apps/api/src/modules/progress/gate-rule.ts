/**
 * The progression rule, as a pure function over already-fetched data.
 *
 * Pure on purpose: this is the single sentence that decides what a student may
 * open, and it deserves an exhaustive test table rather than a database
 * fixture per case. `LessonGateService` does the I/O and calls this.
 */

/** Cleared = the student is done with it. Identical to the predicate
 *  `CourseProgressService.recalculate` counts, so "the progress bar moved" and
 *  "the next lesson opened" can never disagree. */
export const CLEARED_STATES = ['completed', 'passed'] as const;

export type GateState = 'cleared' | 'available' | 'locked';

export interface GateLesson {
  id: string;
  isFreePreview: boolean;
  /** `LessonProgress.state`, or 'not_started' when there is no row yet. */
  state: string;
}

export interface GateInput {
  mode: 'open' | 'sequential';
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
 * Returns a Map rather than a per-lesson predicate because the rule is
 * inherently about the sequence: answering "is lesson 7 open?" requires
 * lesson 6's state, so computing them one at a time would re-walk the list per
 * question.
 *
 * The rules, in the order they apply:
 *
 *   1. `open` mode → everything is available. Nothing below runs.
 *   2. Already cleared → `cleared`, whatever else is true. Unlocking is
 *      monotonic; a lesson that has been finished never closes.
 *   3. The EXAM is available only when every OTHER published lesson is
 *      cleared — not merely when its predecessor is. This is the one rule that
 *      does not read "the previous lesson", and it is why `examLessonId` is a
 *      column rather than a convention about position.
 *   4. Free preview → always available. Marketing content is never gated.
 *   5. First lesson → available. Something has to be.
 *   6. Otherwise → available iff the immediately preceding published lesson is
 *      cleared. "Preceding" is course-wide: the run is the whole course
 *      flattened, so the first lesson of section 2 is gated on the last lesson
 *      of section 1.
 */
export function resolveGate(input: GateInput): Map<string, GateState> {
  const result = new Map<string, GateState>();

  if (input.mode === 'open') {
    for (const lesson of input.lessons) {
      result.set(lesson.id, isCleared(lesson.state) ? 'cleared' : 'available');
    }
    return result;
  }

  const everyOtherCleared = (exceptId: string): boolean =>
    input.lessons.every((lesson) => lesson.id === exceptId || isCleared(lesson.state));

  /**
   * ⚠️ The exam is REMOVED from the sequential chain, and this is what stops
   * the whole course deadlocking.
   *
   * The chain used to be `input.lessons` itself, so a lesson's prerequisite
   * was whatever sat at `index - 1` — the exam included. Combine that with
   * rule 3 (the exam opens only once every OTHER lesson is cleared) and any
   * course whose exam is not last describes a cycle:
   *
   *     exam        needs  every other lesson cleared
   *     lesson N+1  needs  the exam cleared            ← because it is at N
   *
   * Neither can ever be satisfied first. Every lesson after the exam is locked
   * forever, the exam is locked forever, and no action the student can take
   * changes any of it.
   *
   * The worst case is an exam at position 0 — which `POST /exam/scaffold`
   * produces on a course with no sections yet, and which an admin dragging the
   * exam upward produces at any time. Then rule 5 ("first lesson → available,
   * something has to be") never fires either, because rule 3 matched first and
   * returned `locked`. The student opens the course and EVERY lesson is shut.
   * There is no unstick path in the product: no admin control writes gate
   * state, so the only repair is moving the exam and waiting for a re-render.
   *
   * Excluding it is not a special case, it is the actual rule. The exam is
   * gated on everything else by definition, so nothing may ever be gated on
   * the exam — it cannot be a prerequisite without being its own prerequisite.
   * Rules 5 and 6 therefore walk the course as if the exam were not in it.
   */
  const chain = input.lessons.filter((lesson) => lesson.id !== input.examLessonId);
  const chainIndex = new Map(chain.map((lesson, index) => [lesson.id, index]));

  input.lessons.forEach((lesson) => {
    if (isCleared(lesson.state)) {
      result.set(lesson.id, 'cleared');
      return;
    }

    if (lesson.id === input.examLessonId) {
      result.set(lesson.id, everyOtherCleared(lesson.id) ? 'available' : 'locked');
      return;
    }

    const index = chainIndex.get(lesson.id) ?? 0;

    if (lesson.isFreePreview || index === 0) {
      result.set(lesson.id, 'available');
      return;
    }

    const previous = chain[index - 1];
    result.set(lesson.id, previous && isCleared(previous.state) ? 'available' : 'locked');
  });

  return result;
}
