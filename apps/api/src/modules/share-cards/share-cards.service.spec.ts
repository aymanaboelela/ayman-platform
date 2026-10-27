import { NotFoundException } from '@nestjs/common';
import { EXAM_SHELF_TITLE } from '@ayman/contracts/quiz/scheduled';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AttemptService } from '../quiz/attempt.service';
import { ShareCardsService } from './share-cards.service';

/**
 * The result-card gates, with the two collaborators stubbed:
 * `AttemptService.review` already has its own database-backed suite for
 * ownership and the review window, and the certificate rules have
 * `certificates.spec.ts`. What is pinned here is only what this service adds.
 */
describe('ShareCardsService.resultCard', () => {
  const user = { name: 'مريم', studentProfile: { fullName: 'مريم أحمد عبد الرحمن' } };
  const lessonIn = (sectionTitle: string) => ({
    submittedAt: new Date('2026-10-20T10:00:00.000Z'),
    quiz: {
      lesson: {
        id: 'l1',
        title: 'امتحان شهر أكتوبر',
        courseId: 'c1',
        sectionId: 's1',
        position: 1,
        section: { title: sectionTitle, position: 1 },
        course: { id: 'c1', slug: 'y2', title: 'تانية بكالوريا', examLessonId: null },
      },
    },
  });
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    quizAttempt: { findFirst: jest.fn().mockResolvedValue(lessonIn(EXAM_SHELF_TITLE)) },
  };
  const review = jest.fn();
  const service = new ShareCardsService(prisma as unknown as PrismaService, { review } as unknown as AttemptService);

  const graded = { locked: false, scaledScore: 18, gradeOutOf: 20, pendingOutOf: 0 };

  it('prints the full name, the exam and the scaled mark — and offers the exam certificate at 85%+', async () => {
    review.mockResolvedValueOnce(graded);
    await expect(service.resultCard('u1', 'a1')).resolves.toEqual({
      studentName: 'مريم أحمد عبد الرحمن',
      examTitle: 'امتحان شهر أكتوبر',
      courseTitle: 'تانية بكالوريا',
      score: 18,
      total: 20,
      examCertificate: true,
      submittedAt: '2026-10-20T10:00:00.000Z',
    });
  });

  it('offers no exam certificate for a lesson quiz, however high the mark', async () => {
    review.mockResolvedValueOnce({ ...graded, scaledScore: 20 });
    prisma.quizAttempt.findFirst.mockResolvedValueOnce(lessonIn('الوحدة الأولى'));
    expect((await service.resultCard('u1', 'a1')).examCertificate).toBe(false);
  });

  it.each([
    ['the review is still locked', { locked: true, reason: 'during' }],
    ['an essay is still with the teacher', { ...graded, pendingOutOf: 5 }],
    ['nothing has been graded', { ...graded, scaledScore: null }],
  ])('has no card while %s', async (_label, payload) => {
    review.mockResolvedValueOnce(payload);
    await expect(service.resultCard('u1', 'a1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
