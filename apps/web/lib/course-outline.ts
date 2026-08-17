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
  /**
   * `LessonProgress.state` — `not_started` when the student has no row yet, and
   * `null` before they enrol.
   *
   * The gate alone cannot tell «not sat yet» from «sat and failed»: both are
   * `available`. A lecture quiz allows ONE sitting, so offering «امتحن» to a
   * student who has already sat it is an invitation to an act they cannot
   * perform — which is exactly what «أنا أصلاً ممتحن» was about.
   */
  state: string | null;
}

/**
 * A lecture, with the quiz that belongs to it.
 *
 * The database still stores the quiz as its own lesson row — it has its own id,
 * its own gate and its own progress — but it is not a step of the course. It is
 * the check on the lecture above it, and the outline draws it that way: indented
 * under its lecture, sharing its number, and never counted.
 *
 * Ownership is ADJACENCY in reading order: a quiz belongs to the nearest lecture
 * before it in the same section. That is exactly the relationship
 * `resolveGate` uses to decide when the quiz opens, so the two cannot disagree
 * about which lecture a quiz hangs off.
 */
export interface OutlineEntry {
  lecture: OutlineLesson;
  quizzes: OutlineLesson[];
}

export interface OutlineSection {
  id: string;
  title: string;
  summary: string | null;
  /** Lectures, each carrying its own quizzes. Quizzes are never top-level. */
  entries: OutlineEntry[];
}

export interface CourseOutline {
  sections: OutlineSection[];
  enrolled: boolean;
  progressPercent: number;
  clearedLessons: number;
  totalLessons: number;
  nextLessonId: string | null;
}

/** The minimum a row has to carry to be nameable as somebody's blocker. */
export interface BlockerCandidate {
  id: string;
  title: string;
  kind: PathNode['kind'];
  gate: OutlineGate;
}

/**
 * The nearest PRECEDING lesson that is not cleared, walking the same flat
 * reading order the gate uses — so the first lesson of section 2 correctly
 * reports the last lesson of section 1 as its blocker.
 *
 * ## Why it is exported rather than a closure inside `buildCourseOutline`
 *
 * Because three screens draw a lock and only one of them could explain it.
 * `/library/[slug]` had this walk and a dialog that names the blocker by title
 * and links to it. The learning path drew an inert `<span aria-disabled>` —
 * pressing it did nothing at all, no message, no focus, no reason. The
 * player's sidebar had a native `title=` tooltip, which does not exist on a
 * touch screen, which is most of this audience.
 *
 * Both of those already hold the same `PathNode[]` this needs, so the fix is
 * to share one derivation rather than to teach two more screens to guess at
 * it. `<LessonLockDialog>` is the other half.
 *
 * ⚠️ `nodes` must be in the gate's own reading order, which is what
 * `/api/me/path` returns. Re-sorting it produces a plausible and WRONG answer:
 * it will still name a lesson, just not the one the server is waiting on.
 */
export function blockerFor(
  /**
   * Structural, not `PathNode[]`, because the three callers hold three
   * different payloads that happen to agree on the four fields this needs.
   * `/path` has `PathNode`, `/library/[slug]` has the same, and the player's
   * sidebar has `progress.ts`'s `OutlineLesson` — a different schema with the
   * same `id`/`title`/`kind`/`gate`. Narrowing to one of them would force a
   * pointless map at the other two call sites.
   */
  nodes: readonly BlockerCandidate[],
  lessonId: string,
): OutlineLesson['blockedBy'] {
  const at = nodes.findIndex((node) => node.id === lessonId);
  if (at < 1) return null;
  for (let i = at - 1; i >= 0; i -= 1) {
    const previous = nodes[i]!;
    if (previous.gate !== 'cleared') {
      return { id: previous.id, title: previous.title, kind: previous.kind };
    }
  }
  return null;
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
   * ⚠️ `index` counts LECTURES, and is incremented only for them.
   *
   * It used to increment per row, so «المحاضرة ٣» and «المحاضرة ٥» were the two
   * quizzes and a three-lecture course numbered up to five. A quiz has no number
   * of its own — it is «كويز المحاضرة ٢», named after the lecture it belongs to
   * — so it takes its lecture's index and the counter does not move.
   */
  let index = 0;

  const toLesson = (
    lesson: CatalogCourseDetail['sections'][number]['lessons'][number],
  ): OutlineLesson => {
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
      blockedBy: gate === 'locked' && !node?.isExam ? blockerFor(nodes, lesson.id) : null,
      index,
      state: node?.state ?? null,
    };
  };

  const sections: OutlineSection[] = course.sections.map((section) => {
    const entries: OutlineEntry[] = [];

    for (const lesson of section.lessons) {
      // The final exam is a quiz lesson too, and it is NOT a lecture's quiz —
      // `resolveGate` rule 3 gates it on the whole course rather than on one
      // lecture. Nesting it would file the course's exam under whichever
      // lecture happened to precede it.
      const isExam = byId.get(lesson.id)?.isExam ?? false;

      if (lesson.kind === 'quiz' && !isExam) {
        const owner = entries.at(-1);
        // A quiz with no lecture before it in this section cannot be nested
        // under anything, so it stands on its own rather than vanishing. The
        // admin can no longer produce one; old courses can still hold one.
        if (owner) {
          owner.quizzes.push(toLesson(lesson));
          continue;
        }
        index += 1;
        entries.push({ lecture: toLesson(lesson), quizzes: [] });
        continue;
      }

      index += 1;
      entries.push({ lecture: toLesson(lesson), quizzes: [] });
    }

    return { id: section.id, title: section.title, summary: section.summary, entries };
  });

  return {
    sections,
    enrolled: path !== null,
    progressPercent: path?.progressPercent ?? 0,
    clearedLessons: path?.clearedLessons ?? 0,
    totalLessons: path?.totalLessons ?? course.lessonCount,
    nextLessonId: path?.nextLessonId ?? null,
  };
}
