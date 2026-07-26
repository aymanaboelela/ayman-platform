import { Injectable } from '@nestjs/common';
import type { RecentScore } from '@ayman/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import type { ScoreFeed } from '../dashboard/score-feed';

/**
 * RECONCILED — Plan 4 shipped `SCORE_FEED` bound to `EmptyScoreFeed`, which
 * correctly reported "no scores yet" while no attempts table existed. Now one
 * does. `DashboardModule` rebinds the provider to this class; the contract
 * (`recentFor(userId, limit): Promise<RecentScore[]>`) is unchanged, so
 * nothing in the dashboard UI or its contract needs to move.
 */
@Injectable()
export class QuizScoreFeed implements ScoreFeed {
  constructor(private readonly prisma: PrismaService) {}

  /** Own attempts only, submitted only, newest first — ownership is in the
   *  WHERE clause, not applied after the fetch. */
  async recentFor(userId: string, limit: number): Promise<RecentScore[]> {
    const attempts = await this.prisma.quizAttempt.findMany({
      where: { userId, submittedAt: { not: null } },
      orderBy: { submittedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        submittedAt: true,
        scaledScore: true,
        quiz: {
          select: {
            gradeOutOf: true,
            lesson: { select: { title: true, course: { select: { slug: true } } } },
          },
        },
      },
    });

    return attempts.map((attempt) => {
      const gradeOutOf = Number(attempt.quiz.gradeOutOf);
      const scaledScore = Number(attempt.scaledScore ?? 0);
      return {
        attemptId: attempt.id,
        quizTitle: attempt.quiz.lesson.title,
        courseSlug: attempt.quiz.lesson.course.slug,
        scorePercent: gradeOutOf > 0 ? Math.round((scaledScore / gradeOutOf) * 100) : 0,
        submittedAt: attempt.submittedAt!.toISOString(),
      };
    });
  }
}
