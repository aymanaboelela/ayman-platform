import { describe, expect, it } from 'vitest';
import type { CatalogCourseDetail, PathCourse, PathNode } from '@ayman/contracts';
import { buildCourseOutline } from './course-outline';

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
  return { id, title: id, kind: 'video', state: 'not_started', gate, isExam: false, ...over };
}

function path(nodes: PathNode[], over: Partial<PathCourse> = {}): PathCourse {
  return {
    id: 'c1',
    slug: 'c1',
    title: 'Course',
    subjectNameAr: 'الفيزياء',
    coverKey: null,
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

describe('buildCourseOutline — naming what a lock is waiting on', () => {
  it('points a locked lesson at the quiz immediately before it', () => {
    // The founder's requirement: "lock lesson 2 until lesson 1's quiz is
    // passed, and the popup says WHICH quiz".
    const outline = buildCourseOutline({
      course: course([{ id: 's1', lessons: [lesson('l1'), lesson('q1', 'quiz'), lesson('l2')] }]),
      path: path([
        node('l1', 'cleared'),
        node('q1', 'available', { kind: 'quiz', title: 'اختبار المحاضرة الأولى' }),
        node('l2', 'locked'),
      ]),
    });

    const l2 = outline.sections[0]!.entries[1]!.lecture;
    expect(l2.gate).toBe('locked');
    expect(l2.blockedBy).toEqual({
      id: 'q1',
      title: 'اختبار المحاضرة الأولى',
      kind: 'quiz',
    });
  });

  it('walks BACK past cleared lessons to the real blocker', () => {
    const outline = buildCourseOutline({
      course: course([{ id: 's1', lessons: [lesson('l1'), lesson('l2'), lesson('l3')] }]),
      // l2 is available-but-unstarted; l3 is locked behind it, not behind l1.
      path: path([node('l1', 'cleared'), node('l2', 'available'), node('l3', 'locked')]),
    });

    expect(outline.sections[0]!.entries[2]!.lecture.blockedBy?.id).toBe('l2');
  });

  it('crosses a section boundary — "preceding" is course-wide, as the gate is', () => {
    const outline = buildCourseOutline({
      course: course([
        { id: 's1', lessons: [lesson('a1')] },
        { id: 's2', lessons: [lesson('b1')] },
      ]),
      path: path([node('a1', 'available'), node('b1', 'locked')]),
    });

    expect(outline.sections[1]!.entries[0]!.lecture.blockedBy?.id).toBe('a1');
  });

  it('names nothing for the exam — its blocker is every other lesson at once', () => {
    // `resolveGate` rule 3: the exam opens only when every OTHER published
    // lesson is cleared, so there is no single lesson to point at.
    const outline = buildCourseOutline({
      course: course([{ id: 's1', lessons: [lesson('l1'), lesson('ex', 'quiz')] }]),
      path: path([node('l1', 'available'), node('ex', 'locked', { isExam: true, kind: 'quiz' })]),
    });

    const exam = outline.sections[0]!.entries[1]!.lecture;
    expect(exam.isExam).toBe(true);
    expect(exam.blockedBy).toBeNull();
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
