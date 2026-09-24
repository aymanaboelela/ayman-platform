/**
 * How many lectures the course's final exam actually waits on — the number the
 * exam row prints.
 *
 * ⚠️ The SAME set `resolveGate` requires cleared, and it has to stay the same:
 *
 *   - published lessons in PUBLISHED sections — `LessonGateService` loads
 *     nothing else (`lesson-gate.service.ts`), so a lecture in a draft section
 *     is invisible to the gate;
 *   - LECTURES only — `isLecture` in `gate-rule.ts` drops quizzes, because a
 *     failed one-sitting quiz would otherwise shut the final forever;
 *   - never the exam itself.
 *
 * It used to count every published lesson but the exam, quizzes and monthly
 * exams included, so a course with three lectures and three quizzes said «بعد
 * ما يخلّص ٦ محاضرة» — «طب دي ليه؟», and there was no answer.
 */
export function examPrerequisiteCount(
  sections: ReadonlyArray<{
    isPublished: boolean;
    lessons: ReadonlyArray<{ id: string; isPublished: boolean; kind: string }>;
  }>,
  examLessonId: string | null,
): number {
  return sections
    .filter((section) => section.isPublished)
    .flatMap((section) => section.lessons)
    .filter((lesson) => lesson.isPublished && lesson.kind !== 'quiz' && lesson.id !== examLessonId)
    .length;
}
