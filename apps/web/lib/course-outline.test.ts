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

    const l2 = outline.sections[0]!.lessons[2]!;
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

    expect(outline.sections[0]!.lessons[2]!.blockedBy?.id).toBe('l2');
  });

  it('crosses a section boundary — "preceding" is course-wide, as the gate is', () => {
    const outline = buildCourseOutline({
      course: course([
        { id: 's1', lessons: [lesson('a1')] },
        { id: 's2', lessons: [lesson('b1')] },
      ]),
      path: path([node('a1', 'available'), node('b1', 'locked')]),
    });

    expect(outline.sections[1]!.lessons[0]!.blockedBy?.id).toBe('a1');
  });

  it('names nothing for the exam — its blocker is every other lesson at once', () => {
    // `resolveGate` rule 3: the exam opens only when every OTHER published
    // lesson is cleared, so there is no single lesson to point at.
    const outline = buildCourseOutline({
      course: course([{ id: 's1', lessons: [lesson('l1'), lesson('ex', 'quiz')] }]),
      path: path([node('l1', 'available'), node('ex', 'locked', { isExam: true, kind: 'quiz' })]),
    });

    const exam = outline.sections[0]!.lessons[1]!;
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

    expect(outline.sections.flatMap((s) => s.lessons.map((l) => l.index))).toEqual([1, 2, 3]);
  });

  it('has no gate at all before the student enrolls', () => {
    const outline = buildCourseOutline({
      course: course([{ id: 's1', lessons: [lesson('l1')] }]),
      path: null,
    });

    expect(outline.enrolled).toBe(false);
    expect(outline.sections[0]!.lessons[0]!.gate).toBeNull();
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
