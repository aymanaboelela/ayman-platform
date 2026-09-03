import { describe, expect, it } from 'vitest';
import { copy, type CatalogCourseDetail, type PathCourse, type PathNode } from '@ayman/contracts';
import {
  buildCourseOutline,
  isLessonFinished,
  lessonStateLabel,
  lessonStateMark,
} from './course-outline';

function lesson(id: string, kind: PathNode['kind'] = 'video') {
  return { id, title: id, kind, estimatedSeconds: 0, isFreePreview: false, durationSeconds: 600 };
}

function course(sections: Array<{ id: string; lessons: ReturnType<typeof lesson>[] }>) {
  return {
    id: 'c1',
    slug: 'c1',
    title: 'Course',
    subtitle: null,
    systemSlug: 'bacc',
    systemNameAr: 'البكالوريا',
    year: 2,
    trackLabelAr: null,
    subjectNameAr: 'برمجة',
    coverKey: null,
    lessonCount: sections.flatMap((s) => s.lessons).length,
    totalSeconds: 0,
    publishedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    description: null,
    sections: sections.map((s) => ({ ...s, title: s.id, summary: null })),
  } as CatalogCourseDetail;
}

function node(
  id: string,
  gate: PathNode['gate'],
  over: Partial<PathNode> = {},
): PathNode {
  return { id, lessonId: id, title: id, kind: 'video', state: 'not_started', gate, isExam: false, ...over };
}

function path(nodes: PathNode[], over: Partial<PathCourse> = {}): PathCourse {
  return {
    id: 'c1',
    slug: 'c1',
    title: 'Course',
    subjectNameAr: 'الفيزياء',
    coverKey: null,
    contentComplete: false,
    // Published unless a case says otherwise — an unpublished course is the
    // exception, and `PathCourseSchema.published` says why it is on the wire.
    published: true,
    progressPercent: 0,
    clearedLessons: 0,
    totalLessons: nodes.length,
    nextLessonId: null,
    nodes,
    ...over,
  };
}

/**
 * What a row says about the STUDENT — the half of the outline that had to grow
 * once the padlocks came off.
 *
 * The suite this replaces asserted `blockedBy`: which lesson a locked row was
 * waiting on. That derivation is deleted with the sequential chain it served
 * (see `gate-rule.ts`), and the exam — the one row `resolveGate` can still
 * close — is blocked by the whole course rather than by any nameable lesson.
 */
describe('lessonStateMark / lessonStateLabel', () => {
  const row = (over: Partial<Parameters<typeof lessonStateMark>[0]> = {}) => ({
    kind: 'video',
    isExam: false,
    gate: 'available' as string | null,
    state: 'not_started' as string | null,
    ...over,
  });

  it('marks a lesson nothing has happened on as NEW', () => {
    expect(lessonStateMark(row())).toBe('new');
    expect(lessonStateLabel(row())).toBe(copy.library.lessonNew);
  });

  it('marks a half-watched lesson as STARTED, not as unwatched', () => {
    // The distinguishing case, and the reason this is three states rather than
    // the negation of `isLessonFinished`: telling a student «لسه ماشوفتهاش»
    // about the lecture they got halfway through is a small lie that costs the
    // marker its credibility on the rows that matter.
    expect(lessonStateMark(row({ state: 'in_progress' }))).toBe('started');
    expect(lessonStateLabel(row({ state: 'in_progress' }))).toBe(copy.library.lessonStarted);
  });

  it('marks a cleared lesson as DONE', () => {
    expect(lessonStateMark(row({ gate: 'cleared', state: 'completed' }))).toBe('done');
    expect(lessonStateLabel(row({ gate: 'cleared', state: 'completed' }))).toBe(
      copy.library.lessonDone,
    );
  });

  it('marks a sat-and-failed lecture quiz as DONE — one sitting, nothing left', () => {
    // `isLessonFinished` already draws this distinction and this must follow
    // it: the row is over even though it is not cleared.
    const failed = row({ kind: 'quiz', state: 'failed' });
    expect(isLessonFinished(failed)).toBe(true);
    expect(lessonStateMark(failed)).toBe('done');
  });

  it('does not tell a student they have not WATCHED a paper', () => {
    // «ماشوفتهاش» is the wrong verb for a quiz, and the exam is a quiz too.
    expect(lessonStateLabel(row({ kind: 'quiz' }))).toBe(copy.library.lessonQuizNew);
    expect(lessonStateLabel(row({ kind: 'quiz', isExam: true }))).toBe(copy.library.lessonQuizNew);
  });

  it('reads a not-yet-enrolled row as NEW rather than throwing on the nulls', () => {
    expect(lessonStateMark(row({ gate: null, state: null }))).toBe('new');
  });
});

describe('buildCourseOutline — the gate it carries', () => {
  it('carries `locked` through for the exam, the one row that can still be shut', () => {
    const outline = buildCourseOutline({
      course: course([{ id: 's1', lessons: [lesson('l1'), lesson('ex', 'quiz')] }]),
      path: path([node('l1', 'available'), node('ex', 'locked', { isExam: true, kind: 'quiz' })]),
    });

    const exam = outline.sections[0]!.entries[1]!.lecture;
    expect(exam.isExam).toBe(true);
    expect(exam.gate).toBe('locked');
  });

  it('leaves every lecture available, in any order and across sections', () => {
    const outline = buildCourseOutline({
      course: course([
        { id: 's1', lessons: [lesson('a1'), lesson('a2')] },
        { id: 's2', lessons: [lesson('b1')] },
      ]),
      path: path([node('a1', 'available'), node('a2', 'available'), node('b1', 'available')]),
    });

    expect(
      outline.sections.flatMap((s) => s.entries.map((e) => e.lecture.gate)),
    ).toEqual(['available', 'available', 'available']);
  });
});

describe('buildCourseOutline — numbering and enrolment', () => {
  it('numbers lessons across the WHOLE course, not per section', () => {
    const outline = buildCourseOutline({
      course: course([
        { id: 's1', lessons: [lesson('a1'), lesson('a2')] },
        { id: 's2', lessons: [lesson('b1')] },
      ]),
      path: null,
    });

    expect(outline.sections.flatMap((s) => s.entries.map((e) => e.lecture.index))).toEqual([
      1, 2, 3,
    ]);
  });

  it('has no gate at all before the student enrolls', () => {
    const outline = buildCourseOutline({
      course: course([{ id: 's1', lessons: [lesson('l1')] }]),
      path: null,
    });

    expect(outline.enrolled).toBe(false);
    expect(outline.sections[0]!.entries[0]!.lecture.gate).toBeNull();
    // …and the total still comes from the catalog, so the outline is not empty
    // for someone deciding whether to start.
    expect(outline.totalLessons).toBe(1);
  });

  it('carries the enrolled student’s own numbers', () => {
    const outline = buildCourseOutline({
      course: course([{ id: 's1', lessons: [lesson('l1'), lesson('l2')] }]),
      path: path([node('l1', 'cleared'), node('l2', 'available')], {
        progressPercent: 50,
        clearedLessons: 1,
        totalLessons: 2,
        nextLessonId: 'l2',
      }),
    });

    expect(outline).toMatchObject({
      enrolled: true,
      progressPercent: 50,
      clearedLessons: 1,
      nextLessonId: 'l2',
    });
  });
});

/**
 * The shape Ayman asked for: «الكويز يبقى جوا المحاضرة نفسها… يجي من المحاضرة
 * جنبها شوية الكويز بتاعها».
 *
 * The database still stores a quiz as its own lesson row, so the change is in
 * how the outline GROUPS those rows — and in what it counts, which is what made
 * a three-lecture course announce «١ درس خلص من ٤».
 */
describe('buildCourseOutline — a quiz belongs to its lecture', () => {
  it('nests a quiz under the lecture before it instead of listing it alongside', () => {
    const outline = buildCourseOutline({
      course: course([
        { id: 's1', lessons: [lesson('l1'), lesson('q1', 'quiz'), lesson('l2')] },
      ]),
      path: null,
    });

    const entries = outline.sections[0]!.entries;
    expect(entries.map((entry) => entry.lecture.id)).toEqual(['l1', 'l2']);
    expect(entries[0]!.quizzes.map((quiz) => quiz.id)).toEqual(['q1']);
    expect(entries[1]!.quizzes).toEqual([]);
  });

  it('numbers LECTURES only — a quiz never consumes a number', () => {
    // Three lectures with a quiz after each used to number up to six, and the
    // outline read «المحاضرة ٢» at what was really lecture 1's quiz.
    const outline = buildCourseOutline({
      course: course([
        {
          id: 's1',
          lessons: [
            lesson('l1'),
            lesson('q1', 'quiz'),
            lesson('l2'),
            lesson('q2', 'quiz'),
            lesson('l3'),
          ],
        },
      ]),
      path: null,
    });

    const entries = outline.sections[0]!.entries;
    expect(entries.map((entry) => entry.lecture.index)).toEqual([1, 2, 3]);
    // The quiz carries its OWNER's number, so «كويز المحاضرة ٢» is true rather
    // than being a fourth thing with a number of its own.
    expect(entries[1]!.quizzes[0]!.index).toBe(2);
  });

  it('keeps the final exam top-level — it is not any one lecture’s quiz', () => {
    // `resolveGate` rule 3 gates the exam on the whole course. Nesting it would
    // file it under whichever lecture happened to sit above it.
    const outline = buildCourseOutline({
      course: course([{ id: 's1', lessons: [lesson('l1'), lesson('ex', 'quiz')] }]),
      path: path([node('l1', 'cleared'), node('ex', 'available', { isExam: true, kind: 'quiz' })]),
    });

    const entries = outline.sections[0]!.entries;
    expect(entries.map((entry) => entry.lecture.id)).toEqual(['l1', 'ex']);
    expect(entries[0]!.quizzes).toEqual([]);
  });

  it('leaves a quiz with no lecture above it standing on its own', () => {
    // The admin can no longer build this; courses created before it can hold
    // one, and it must render rather than disappear.
    const outline = buildCourseOutline({
      course: course([{ id: 's1', lessons: [lesson('q0', 'quiz'), lesson('l1')] }]),
      path: null,
    });

    expect(outline.sections[0]!.entries.map((entry) => entry.lecture.id)).toEqual(['q0', 'l1']);
  });

  it('carries the attempt state through, so a sat quiz can stop saying «امتحن»', () => {
    const outline = buildCourseOutline({
      course: course([{ id: 's1', lessons: [lesson('l1'), lesson('q1', 'quiz')] }]),
      path: path([
        node('l1', 'cleared'),
        // Sat and failed: still `available` to the gate, because there is a
        // result page to open — but there is no second sitting to offer.
        node('q1', 'available', { kind: 'quiz', state: 'failed' }),
      ]),
    });

    expect(outline.sections[0]!.entries[0]!.quizzes[0]!.state).toBe('failed');
  });
});

describe('isLessonFinished', () => {
  const quiz = (state: string, over: Record<string, unknown> = {}) => ({
    kind: 'quiz',
    isExam: false,
    gate: 'available',
    state,
    ...over,
  });

  it('counts a sat-and-failed lecture quiz as finished', () => {
    // The bug this closes: one sitting, spent, a grade on the record — and
    // every outline drew the row as untouched because `failed` is not
    // `cleared`. «أنا امتحنت أصلاً ومعايا الدرجة، يبقى عليها علامة صح».
    expect(isLessonFinished(quiz('failed'))).toBe(true);
  });

  it('counts a passed quiz and a completed lecture as finished', () => {
    expect(isLessonFinished(quiz('passed', { gate: 'cleared' }))).toBe(true);
    expect(
      isLessonFinished({ kind: 'video', isExam: false, gate: 'cleared', state: 'completed' }),
    ).toBe(true);
  });

  it('leaves a quiz that has not been sat, and a locked one, unfinished', () => {
    expect(isLessonFinished(quiz('not_started'))).toBe(false);
    expect(isLessonFinished(quiz('not_started', { gate: 'locked' }))).toBe(false);
  });

  it('does NOT tick a failed EXAM — its improvement sitting may still be there', () => {
    // The outline payload carries no attempt count, so "failed" on an exam
    // cannot be told from "failed with an improvement sitting still open". A
    // missing tick is the cheap mistake; telling a student they are done with
    // a grade they could still raise is not.
    expect(isLessonFinished(quiz('failed', { isExam: true }))).toBe(false);
  });

  it('never calls a failed VIDEO finished — only a quiz has that ending', () => {
    expect(
      isLessonFinished({ kind: 'video', isExam: false, gate: 'available', state: 'failed' }),
    ).toBe(false);
  });
});
