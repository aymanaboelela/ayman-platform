import { copy } from '@ayman/contracts/copy';
import type { CatalogCourseDetail } from '@ayman/contracts/catalog';
import type { PathCourse, PathNode } from '@ayman/contracts/path';

/**
 * The course outline a signed-in student sees: the public section/lesson tree,
 * joined to the gate the server actually enforces and to what the student has
 * already done with each row.
 *
 * ## Why the second half of that sentence is now the important half
 *
 * This file used to carry `blockerFor`, which named the lesson standing in
 * front of a locked one. It has been deleted along with the sequential chain
 * it served (`gate-rule.ts`): every lecture and every lecture quiz opens the
 * day a student enrols, and the exam — the one row `resolveGate` can still
 * close — is blocked by the whole course rather than by any nameable lesson.
 *
 * What the padlock was doing, besides refusing, was telling the student where
 * they were: a run of locks with one open row at the front answered "where am
 * I" by the SHAPE of the list. With everything open the shape says nothing, so
 * the state has to be said in words on every row — `lessonStateLabel`, below.
 *
 * ⚠️ Everything here is PRESENTATION. The gate is enforced by
 * `/courses/:slug/lessons/:id`, which re-derives it on every request and 404s
 * the locked exam. Editing this away in devtools opens nothing.
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

/**
 * Whether this row is OVER — nothing the student can do will change it again.
 *
 * ## Why this is not simply `gate === 'cleared'`
 *
 * Because a quiz has a way of ending that a lecture does not. `cleared` means
 * `state ∈ {completed, passed}` (see `CLEARED_STATES` in apps/api), so a
 * lecture quiz sat and FAILED stays `available` forever — and every outline on
 * this platform drew it as unfinished: no tick, no «خلصت», and the amber chip
 * that means "this is the thing that moves you forward". It is not. A lecture
 * quiz allows exactly ONE sitting (`attemptAllowance`, and «كل كويز ليه محاولة
 * واحدة. مفيش إعادة» on the admin's own screen), so once it is sat there is
 * nothing left to do with that row but read the result — which is precisely
 * «أنا امتحنت أصلاً ومعايا الدرجة، يبقى عليها علامة صح».
 *
 * ⚠️ PRESENTATION ONLY. The gate is unchanged and so is every count derived
 * from it: `clearedLessons`, the section's «٢ / ٣» and the progress bar still
 * count `cleared`, because a failed quiz is not a pass and the progress bar is
 * not a "rows you have finished with" bar.
 *
 * ## The exam is excluded on purpose
 *
 * A course exam can offer a second, IMPROVEMENT sitting (`allowsImprovement`),
 * and the outline payload carries nothing that says whether that sitting is
 * still there. Ticking it would tell a student who can still improve their
 * grade that they are done — the expensive direction of this mistake — so the
 * exam keeps the old rule and ticks only once it is actually passed.
 *
 * The same caveat applies, much more rarely, to a lecture quiz an admin has
 * granted an extra attempt on (`extraAttempts`): the row reads as finished
 * while one sitting remains. The notification that announces the grant is what
 * carries that news, and it is not worth a per-lesson attempt count on a
 * payload every lesson page fetches.
 */
/** What a row says about the student, once nothing on it is hidden. */
export type LessonStateMark = 'done' | 'started' | 'new';

/** The four fields every one of the three payloads happens to agree on. */
export interface StatefulLesson {
  kind: string;
  isExam: boolean;
  gate: string | null;
  state: string | null;
}

/**
 * Has the student been here — and the reason it is a THIRD state rather than
 * the negation of `isLessonFinished`.
 *
 * `in_progress` is written by the video heartbeat and by dwell on a reading,
 * so it means the student genuinely opened the lesson and did not finish it.
 * Telling them «لسه ماشوفتهاش» about a lecture they watched half of is a small
 * lie that costs the marker its credibility on the rows that matter — and the
 * half-watched lecture is exactly the row a student is looking for when they
 * come back.
 *
 * `null` state (not enrolled) reads as `new`: nothing has happened, because
 * nothing could have.
 */
export function lessonStateMark(lesson: StatefulLesson): LessonStateMark {
  if (isLessonFinished(lesson)) return 'done';
  return lesson.state === 'in_progress' ? 'started' : 'new';
}

/**
 * The same thing as a WORD, which is the form that survives being read aloud,
 * printed, or looked at by someone who cannot separate two greys.
 *
 * Kind-aware on the one axis Arabic forces: «ماشوفتهاش» is the wrong verb for a
 * paper, so a quiz — the final exam included — says «لسه ما امتحنتش» instead.
 * See `copy.library.lessonNew` for why none of the three is an imperative.
 */
export function lessonStateLabel(lesson: StatefulLesson): string {
  const c = copy.library;
  switch (lessonStateMark(lesson)) {
    case 'done':
      return c.lessonDone;
    case 'started':
      return c.lessonStarted;
    default:
      return lesson.kind === 'quiz' ? c.lessonQuizNew : c.lessonNew;
  }
}

export function isLessonFinished(lesson: {
  kind: string;
  isExam: boolean;
  gate: string | null;
  state: string | null;
}): boolean {
  if (lesson.gate === 'cleared' || lesson.state === 'completed' || lesson.state === 'passed') {
    return true;
  }
  return lesson.kind === 'quiz' && !lesson.isExam && lesson.state === 'failed';
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
