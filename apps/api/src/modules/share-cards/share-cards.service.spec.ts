import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AttemptService } from '../quiz/attempt.service';
import { ShareCardsService } from './share-cards.service';

/**
 * The gates, with the two collaborators stubbed: `AttemptService.review`
 * already has its own database-backed suite for ownership and the review
 * window, so what is pinned here is only what this service adds on top.
 */
describe('ShareCardsService', () => {
  const user = { name: 'مريم', studentProfile: { fullName: 'مريم أحمد عبد الرحمن' } };
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    quizAttempt: { findFirst: jest.fn().mockResolvedValue({ quiz: { lesson: { title: 'امتحان الشهر' } } }) },
    enrollment: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const review = jest.fn();
  const service = new ShareCardsService(
    prisma as unknown as PrismaService,
    { review } as unknown as AttemptService,
  );

  const graded = { locked: false, scaledScore: 18, gradeOutOf: 20, pendingOutOf: 0 };

  it('prints the full name, the lesson title and the scaled mark of a final attempt', async () => {
    review.mockResolvedValueOnce(graded);
    await expect(service.resultCard('u1', 'a1')).resolves.toEqual({
      studentName: 'مريم أحمد عبد الرحمن',
      examTitle: 'امتحان الشهر',
      score: 18,
      total: 20,
    });
  });

  it.each([
    ['the review is still locked', { locked: true, reason: 'during' }],
    ['an essay is still with the teacher', { ...graded, pendingOutOf: 5 }],
    ['nothing has been graded', { ...graded, scaledScore: null }],
  ])('has no card while %s', async (_label, payload) => {
    review.mockResolvedValueOnce(payload);
    await expect(service.resultCard('u1', 'a1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('asks only for finished enrolments on live, complete courses', async () => {
    prisma.enrollment.findMany.mockResolvedValueOnce([
      { completedAt: new Date('2026-08-18T10:00:00.000Z'), course: { id: 'c1', slug: 'calc', title: 'التفاضل' } },
    ]);
    const result = await service.certificates('u1');

    expect(prisma.enrollment.findMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      status: { in: ['active', 'completed'] },
      completedAt: { not: null },
      progressPercent: { gte: 100 },
      course: { status: 'published', contentComplete: true },
    });
    expect(result).toEqual({
      studentName: 'مريم أحمد عبد الرحمن',
      certificates: [{ courseId: 'c1', slug: 'calc', title: 'التفاضل', completedAt: '2026-08-18T10:00:00.000Z' }],
    });
  });

  it('falls back to the account name before onboarding', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ name: 'مريم', studentProfile: null });
    expect((await service.certificates('u1')).studentName).toBe('مريم');
  });
});
