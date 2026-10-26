import type { LearningPath, PathCourse, PathNode } from '@ayman/contracts/path';
import { StudentBacklogSchema } from '@ayman/contracts/backlog';
import type { PrismaService } from '../../prisma/prisma.service';
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
): BacklogService {
  const path = { forUser: async (): Promise<LearningPath> => ({ courses, currentCourseId: null, clearedLessons: 0, totalLessons: 0, percent: 0 }) };
  const prisma = {
    lessonHomework: { findMany: async () => homework.map((lessonId) => ({ lessonId })) },
    homeworkSubmission: { findMany: async () => submissions },
  };
  return new BacklogService(prisma as unknown as PrismaService, path as unknown as PathService);
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
