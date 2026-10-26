import { Injectable, NotFoundException } from '@nestjs/common';
import type { CertificatesPayload, ResultCardPayload } from '@ayman/contracts/share-cards';
import { PrismaService } from '../../prisma/prisma.service';
import { AttemptService } from '../quiz/attempt.service';

/**
 * The data behind «كارت النتيجة» and «شهاداتي». The images themselves are
 * drawn in the browser; this decides who gets one and what it says.
 */
@Injectable()
export class ShareCardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attempts: AttemptService,
  ) {}

  /**
   * A result card, only for a mark that will not move.
   *
   * Goes through `AttemptService.review` rather than reading the attempt
   * directly, so the card inherits every rule the review screen already
   * enforces: ownership, a revoked enrolment or unpublished lesson (404), and
   * the review window — a card must not print a score the review page is
   * still withholding. Then two more of its own: no essay still with the
   * teacher, and a score that exists.
   */
  async resultCard(userId: string, attemptId: string): Promise<ResultCardPayload> {
    const review = await this.attempts.review(userId, attemptId);
    if (review.locked || review.scaledScore === null || review.pendingOutOf > 0) throw new NotFoundException();

    const [attempt, studentName] = await Promise.all([
      this.prisma.quizAttempt.findFirst({
        where: { id: attemptId, userId },
        select: { quiz: { select: { lesson: { select: { title: true } } } } },
      }),
      this.studentName(userId),
    ]);
    if (!attempt) throw new NotFoundException();

    return {
      studentName,
      examTitle: attempt.quiz.lesson.title,
      score: review.scaledScore,
      total: review.gradeOutOf,
    };
  }

  /**
   * One certificate per course this student has FINISHED: the enrolment's
   * `completedAt` (stamped by `CourseProgressService` the first time progress
   * reaches 100%, cleared when new lessons are published) on a live course
   * the teacher has marked `contentComplete`. The second half is the course
   * page's own «خلّصنا الكورس» rule — 100% of a half-published syllabus is
   * not a finished course, and a certificate for it would have to be taken
   * back.
   */
  async certificates(userId: string): Promise<CertificatesPayload> {
    const [rows, studentName] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: {
          userId,
          status: { in: ['active', 'completed'] },
          completedAt: { not: null },
          progressPercent: { gte: 100 },
          course: { status: 'published', contentComplete: true },
        },
        orderBy: { completedAt: 'desc' },
        select: { completedAt: true, course: { select: { id: true, slug: true, title: true } } },
      }),
      this.studentName(userId),
    ]);

    return {
      studentName,
      certificates: rows.map((row) => ({
        courseId: row.course.id,
        slug: row.course.slug,
        title: row.course.title,
        completedAt: (row.completedAt ?? new Date()).toISOString(),
      })),
    };
  }

  /**
   * The full name from onboarding (three parts, NOT NULL), falling back to
   * the account name for a student who has not finished it. A certificate is
   * the one place a first name alone looks wrong.
   */
  private async studentName(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, studentProfile: { select: { fullName: true } } },
    });
    return user?.studentProfile?.fullName?.trim() || user?.name?.trim() || '';
  }
}
