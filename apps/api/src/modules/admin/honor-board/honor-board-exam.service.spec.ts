import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminHonorBoardService } from './honor-board.service';
import { honorDayKey } from '../../catalog/honor-board';

const LESSON = '0199a000-0000-7000-8000-000000000001';
const QUIZ = '0199a000-0000-7000-8000-0000000000aa';
const A1 = '0199a000-0000-7000-8000-000000000a01';
const A2 = '0199a000-0000-7000-8000-000000000a02';
const A3 = '0199a000-0000-7000-8000-000000000a03';

function paper(id: string, userId: string, over: Record<string, unknown> = {}) {
  return {
    id,
    userId,
    quizId: QUIZ,
    state: 'submitted',
    startedAt: new Date('2026-10-17T17:00:00Z'),
    quiz: { lateAfter: null },
    ...over,
  };
}

function makeService(opts: { papers?: unknown[]; existing?: unknown[] } = {}) {
  const audit = { record: jest.fn(async () => ({})) };
  const notifications = {
    emit: jest.fn(async () => undefined),
    announceAll: jest.fn(async () => undefined),
  };
  let created = 0;
  const tx = {
    honorBoardPin: {
      findMany: jest.fn(async () => opts.existing ?? []),
      deleteMany: jest.fn(async () => ({ count: 0 })),
      update: jest.fn(async () => ({})),
      create: jest.fn(async () => ({ id: `pin-${++created}` })),
    },
    studentProfile: { updateMany: jest.fn(async () => ({ count: 1 })) },
    quizAttempt: { updateMany: jest.fn(async () => ({ count: 0 })) },
  };
  const prisma = {
    lesson: {
      findFirst: jest.fn(async () => ({
        id: LESSON,
        title: 'امتحان آخر الشهر',
        courseId: '0199a000-0000-7000-8000-0000000000cc',
        course: { year: 2, forGeneral: true, forLanguages: false },
        quiz: { id: QUIZ },
      })),
    },
    quizAttempt: { findMany: jest.fn(async () => opts.papers ?? []) },
    $transaction: jest.fn(async (fn: (client: unknown) => Promise<unknown>) => fn(tx)),
  };
  const service = new AdminHonorBoardService(prisma as never, audit as never, notifications as never);
  return { service, prisma, tx, audit, notifications };
}

describe('AdminHonorBoardService.publishExam', () => {
  it('ranks as told, notifies only the newcomers, and takes off who was dropped', async () => {
    const { service, tx, notifications } = makeService({
      papers: [paper(A1, 'u1'), paper(A2, 'u2')],
      existing: [
        { id: 'old-1', attemptId: A1, userId: 'u1' },
        { id: 'old-3', attemptId: A3, userId: 'u3' },
      ],
    });

    const result = await service.publishExam(
      LESSON,
      {
        day: '2026-10-18',
        picks: [
          { attemptId: A2, rank: 1 },
          { attemptId: A1, rank: 2 },
        ],
      },
      'admin-1',
    );

    expect(result).toEqual({ added: 1, updated: 1, removed: 1 });
    expect(tx.honorBoardPin.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['old-3'] } } });

    const create = tx.honorBoardPin.create.mock.calls[0]?.[0] as unknown as {
      data: { userId: string; attemptId: string; rank: number; reason: string; honoredAt: Date };
    };
    expect(create.data).toMatchObject({ userId: 'u2', attemptId: A2, rank: 1, reason: 'امتحان آخر الشهر' });
    expect(honorDayKey(create.data.honoredAt)).toBe('2026-10-18');

    expect(tx.honorBoardPin.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'old-1' }, data: expect.objectContaining({ rank: 2 }) }),
    );
    // u1 was already on the board: no second «مبروك».
    expect(notifications.emit).toHaveBeenCalledTimes(1);
    expect(notifications.emit).toHaveBeenCalledWith(tx, {
      userId: 'u2',
      kind: 'honor_board_listed',
      pinId: 'pin-1',
    });
    expect(notifications.announceAll).toHaveBeenCalledWith(['u2']);
  });

  it('clears the exam’s grading-screen pins so nobody is on the board twice', async () => {
    const { service, tx } = makeService({ papers: [paper(A1, 'u1')] });
    await service.publishExam(LESSON, { day: '2026-10-18', picks: [{ attemptId: A1, rank: 1 }] }, 'a');
    expect(tx.quizAttempt.updateMany).toHaveBeenCalledWith({
      where: { quizId: QUIZ, honorBoardAt: { not: null } },
      data: { honorBoardAt: null },
    });
  });

  it('writes a new board photo to the student’s profile', async () => {
    const { service, tx } = makeService({ papers: [paper(A1, 'u1')] });
    await service.publishExam(
      LESSON,
      { day: '2026-10-18', picks: [{ attemptId: A1, rank: 1, photoKey: 'ab/face.webp' }] },
      'a',
    );
    expect(tx.studentProfile.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { honorPhotoKey: 'ab/face.webp' },
    });
  });

  it('refuses a late paper and a paper from another exam', async () => {
    const late = makeService({
      papers: [paper(A1, 'u1', { quiz: { lateAfter: new Date('2026-10-17T16:00:00Z') } })],
    });
    await expect(
      late.service.publishExam(LESSON, { day: '2026-10-18', picks: [{ attemptId: A1, rank: 1 }] }, 'a'),
    ).rejects.toBeInstanceOf(BadRequestException);

    const other = makeService({ papers: [paper(A1, 'u1', { quizId: 'another-quiz' })] });
    await expect(
      other.service.publishExam(LESSON, { day: '2026-10-18', picks: [{ attemptId: A1, rank: 1 }] }, 'a'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(other.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('404s a malformed exam id instead of handing it to Postgres', async () => {
    const { service, prisma } = makeService();
    await expect(service.publishExam('nope', { day: '2026-10-18', picks: [] }, 'a')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.lesson.findFirst).not.toHaveBeenCalled();
  });
});
