import type { CatalogCourseDetail } from '@ayman/contracts/catalog';
import type { PathCourse, PathNode } from '@ayman/contracts/path';

/**
 * The course outline a signed-in student sees: the public section/lesson tree,
 * joined to the gate the server actually enforces, plus — for every locked
 * lesson — the NAME of the thing standing in front of it.
 *
 * ## Why the blocker is derived here and not sent by the API
 *
 * `resolveGate` (apps/api) already computes exactly this ordering to decide
 * `locked` in the first place, and `/api/me/path` returns its result in
 * reading order. The blocker is a one-line consequence of that same order —
 * the nearest preceding lesson that is not cleared — so deriving it here costs
 * nothing and needs no new endpoint. Sending it would mean a second place that
 * has to agree with the gate about what "preceding" means.
 *
 * ⚠️ Everything here is PRESENTATION. The lock is enforced by
 * `/courses/:slug/lessons/:id`, which re-derives the gate on every request and
 * 404s a locked lesson. Editing this away in devtools opens nothing.
 */

export type OutlineGate = 'cleared' | 'available' | 'locked';

export interface OutlineLesson {
  id: string;
  title: string;
  kind: PathNode['kind'];
  durationSeconds: number | null;
  isExam: boolean;
  /** `null` when the student is not enrolled — nothing has a state yet. */
  gate: OutlineGate | null;
  /**
   * What has to happen first, for a locked lesson. `null` for anything not
   * locked, and for the exam — whose blocker is "the rest of the course"
   * rather than one nameable lesson, which the UI says in its own words.
   */
  blockedBy: { id: string; title: string; kind: PathNode['kind'] } | null;
  /** 1-based place in the WHOLE course, so «المحاضرة ٧» keeps counting across sections. */
  index: number;
}

export interface OutlineSection {
  id: string;
  title: string;
  summary: string | null;
  lessons: OutlineLesson[];
}

export interface CourseOutline {
  sections: OutlineSection[];
  enrolled: boolean;
  progressPercent: number;
  clearedLessons: number;
  totalLessons: number;
  nextLessonId: string | null;
}

export function buildCourseOutline({
  course,
  path,
}: {
  course: CatalogCourseDetail;
  /** The same course from `/api/me/path`, or `null` when not enrolled. */
  path: PathCourse | null;
}): CourseOutline {
  const nodes = path?.nodes ?? [];
  const byId = new Map(nodes.map((node) => [node.id, node]));

  /**
   * The nearest PRECEDING lesson that is not cleared, walking the same flat
   * reading order the gate uses — so the first lesson of section 2 correctly
   * reports the last lesson of section 1 as its blocker.
   */
  const blockerFor = (lessonId: string): OutlineLesson['blockedBy'] => {
    const at = nodes.findIndex((node) => node.id === lessonId);
    if (at < 1) return null;
    for (let i = at - 1; i >= 0; i -= 1) {
      const previous = nodes[i]!;
      if (previous.gate !== 'cleared') {
        return { id: previous.id, title: previous.title, kind: previous.kind };
      }
    }
    return null;
  };

  let index = 0;
  const sections: OutlineSection[] = course.sections.map((section) => ({
    id: section.id,
    title: section.title,
    summary: section.summary,
    lessons: section.lessons.map((lesson) => {
      index += 1;
      const node = byId.get(lesson.id);
      const gate = node?.gate ?? null;
      return {
        id: lesson.id,
        title: lesson.title,
        kind: lesson.kind,
        durationSeconds: lesson.durationSeconds,
        isExam: node?.isExam ?? false,
        gate,
        // The exam's blocker is every other lesson at once, not one nameable
        // predecessor — rule 3 in `resolveGate`. The UI says that in words
        // rather than pointing at an arbitrary lesson.
        blockedBy: gate === 'locked' && !node?.isExam ? blockerFor(lesson.id) : null,
        index,
      };
    }),
  }));

  return {
    sections,
    enrolled: path !== null,
    progressPercent: path?.progressPercent ?? 0,
    clearedLessons: path?.clearedLessons ?? 0,
    totalLessons: path?.totalLessons ?? course.lessonCount,
    nextLessonId: path?.nextLessonId ?? null,
  };
}
