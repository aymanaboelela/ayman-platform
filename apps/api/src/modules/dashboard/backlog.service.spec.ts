import type { LearningPath, PathCourse, PathNode } from '@ayman/contracts/path';
import { StudentBacklogSchema } from '@ayman/contracts/backlog';
import type { StudentExam } from '@ayman/contracts/quiz/scheduled';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ScheduledExamsService } from '../quiz/scheduled-exams.service';
import { BacklogService } from './backlog.service';
import type { PathService } from './path.service';

/**
 * «المتراكم عليّا» over a stubbed path. The path's own gate decisions are
 * covered by its specs; what is pinned here is what this screen ADDS to them —
 * which stops count as owed, and the homework join.
 */
function node(over: Partial<PathNode> & { id: string }): PathNode {
  return { lessonId: over.id, title: over.id, kind: 'video', state: 'not_started', gate: 'available', isExam: false, ...over };
}

function course(over: Partial<PathCourse> & { nodes: PathNode[] }): PathCourse {
  return {
    id: 'c1',
    slug: 'prog-2',
    title: 'برمجة',
    subjectNameAr: 'البرمجة',
    coverKey: null,
    published: true,
    progressPercent: 0,
    clearedLessons: 0,
    totalLessons: 0,
    contentComplete: false,
    whatsappGroupUrl: null,
    nextLessonId: null,
    ...over,
  };
}

function service(
  courses: PathCourse[],
  homework: string[] = [],
  submissions: { lessonId: string; status: string }[] = [],
  exams: StudentExam[] = [],
): BacklogService {
  const path = { forUser: async (): Promise<LearningPath> => ({ courses, currentCourseId: null, clearedLessons: 0, totalLessons: 0, percent: 0 }) };
  const prisma = {
    lessonHomework: { findMany: async () => homework.map((lessonId) => ({ lessonId })) },
    homeworkSubmission: { findMany: async () => submissions },
  };
  const scheduled = { forStudent: async () => ({ exams, serverTime: new Date().toISOString() }) };
  return new BacklogService(
    prisma as unknown as PrismaService,
    path as unknown as PathService,
    scheduled as unknown as ScheduledExamsService,
  );
}

function exam(over: Partial<StudentExam> & { lessonId: string }): StudentExam {
  return {
    courseId: 'c1',
    courseTitle: 'برمجة',
    courseSlug: 'prog-2',
    title: over.lessonId,
    phase: 'closed',
    openFrom: null,
    openUntil: '2026-09-12T17:00:00.000Z',
    keptOpen: true,
    durationSeconds: 5400,
    gradeOutOf: 100,
    coveredLessons: [],
    scaledScore: null,
    hasSat: false,
    ...over,
  };
}

describe('BacklogService', () => {
  it('lists open lectures and unsat quizzes, never cleared or locked ones', async () => {
    const result = await service([
      course({
        nodes: [
          node({ id: 'l1', gate: 'cleared', state: 'completed' }),
          // Watched lecture, attached quiz never sat: the quiz stop carries the
          // HOST's `cleared` gate and must still count.
          node({ id: 'q1', lessonId: 'l1', kind: 'quiz', gate: 'cleared', state: 'not_started' }),
          node({ id: 'l2', state: 'in_progress' }),
          node({ id: 'q2', kind: 'quiz', state: 'failed' }),
          node({ id: 'l3', gate: 'locked' }),
          node({ id: 'q3', lessonId: 'l3', kind: 'quiz', gate: 'locked' }),
        ],
      }),
    ]).forUser('u');

    expect(StudentBacklogSchema.parse(result)).toEqual(result);
    expect(result.courses[0]!.items.map((item) => [item.id, item.kind, item.status])).toEqual([
      ['q1', 'quiz', 'not_started'],
      ['l2', 'lecture', 'in_progress'],
    ]);
    expect(result.counts).toEqual({ lectures: 1, quizzes: 1, homework: 0, awaitingReview: 0 });
  });

  it('counts the final exam once it opens, as a sitting', async () => {
    const result = await service([
      course({ nodes: [node({ id: 'ex', kind: 'quiz', isExam: true })] }),
    ]).forUser('u');
    expect(result.courses[0]!.items[0]).toMatchObject({ kind: 'exam' });
    expect(result.counts.quizzes).toBe(1);
  });

  it('owes a monthly exam never sat while it can still be sat, first in its course', async () => {
    const result = await service(
      [course({ nodes: [node({ id: 'l1' })] })],
      [],
      [],
      [
        exam({ lessonId: 'late' }), // past the deadline, kept open → owed
        exam({ lessonId: 'now', phase: 'open', keptOpen: false }), // open tonight → owed
        exam({ lessonId: 'shut', keptOpen: false }), // closed and NOT kept open → a door that does not open
        exam({ lessonId: 'sat', hasSat: true, scaledScore: 80 }), // sat → history
        exam({ lessonId: 'soon', phase: 'upcoming' }), // not owed yet
        exam({ lessonId: 'other', courseId: 'c9' }), // a course not on their path
      ],
    ).forUser('u');

    expect(StudentBacklogSchema.parse(result)).toEqual(result);
    expect(result.courses[0]!.items.map((item) => [item.id, item.kind, item.monthlyExam ?? false])).toEqual([
      ['exam:late', 'exam', true],
      ['exam:now', 'exam', true],
      ['l1', 'lecture', false],
    ]);
    expect(result.counts.quizzes).toBe(2);
  });

  it('lists a course with nothing owed but a monthly exam', async () => {
    const result = await service(
      [course({ nodes: [node({ id: 'l1', gate: 'cleared', state: 'completed' })] })],
      [],
      [],
      [exam({ lessonId: 'late' })],
    ).forUser('u');
    expect(result.courses).toHaveLength(1);
    expect(result.courses[0]!.items[0]).toMatchObject({ kind: 'exam', lessonId: 'late', monthlyExam: true });
  });

  it('owes homework on a watched lecture until it is handed in', async () => {
    const result = await service(
      [
        course({
          nodes: [
            node({ id: 'a', gate: 'cleared', state: 'completed' }),
            node({ id: 'b', gate: 'cleared', state: 'completed' }),
            node({ id: 'c', gate: 'cleared', state: 'completed' }),
            node({ id: 'd', gate: 'cleared', state: 'completed' }),
            node({ id: 'e', gate: 'locked' }),
          ],
        }),
      ],
      ['a', 'b', 'c', 'd', 'e'],
      [
        { lessonId: 'b', status: 'needs_work' },
        { lessonId: 'c', status: 'submitted' },
        { lessonId: 'd', status: 'accepted' },
      ],
    ).forUser('u');

    expect(result.courses[0]!.items.map((item) => [item.id, item.status])).toEqual([
      ['hw:a', 'not_started'],
      ['hw:b', 'redo'],
    ]);
    expect(result.counts).toEqual({ lectures: 0, quizzes: 0, homework: 2, awaitingReview: 1 });
  });

  it('drops an unpublished course and a course with nothing owed', async () => {
    const result = await service([
      course({ id: 'closed', published: false, nodes: [node({ id: 'x' })] }),
      course({ id: 'done', nodes: [node({ id: 'y', gate: 'cleared', state: 'completed' })] }),
    ]).forUser('u');
    expect(result.courses).toEqual([]);
  });
});
