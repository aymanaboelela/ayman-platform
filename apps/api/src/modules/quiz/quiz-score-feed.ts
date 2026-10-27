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
        // The attempt's OWN snapshot, not `quiz.gradeOutOf`: a teacher who
        // lowers a quiz's grade after students sat it (40 → 20) turned every
        // old mark into 200%, and `RecentScoreSchema.max(100)` then failed
        // the whole dashboard response — not just the one row.
        gradeOutOf: true,
        quiz: {
          select: {
            lesson: { select: { title: true, course: { select: { slug: true } } } },
          },
        },
      },
    });

    return attempts.map((attempt) => {
      const gradeOutOf = Number(attempt.gradeOutOf);
      const scaledScore = Number(attempt.scaledScore ?? 0);
      const percent = gradeOutOf > 0 ? Math.round((scaledScore / gradeOutOf) * 100) : 0;
      return {
        attemptId: attempt.id,
        quizTitle: attempt.quiz.lesson.title,
        courseSlug: attempt.quiz.lesson.course.slug,
        // Clamped as well: a bonus or a hand-regrade can still push a mark past
        // its own ceiling, and one row must never take the page down with it.
        scorePercent: Math.min(Math.max(percent, 0), 100),
        submittedAt: attempt.submittedAt!.toISOString(),
      };
    });
  }
}
