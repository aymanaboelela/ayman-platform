import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';

/** Anything with a `lesson`, `lessonProgress` and `enrollment` delegate — the
 *  PrismaService itself or a transaction client, interchangeably. */
type PrismaLike = Prisma.TransactionClient;

@Injectable()
export class CourseProgressService {
  /**
   * Course progress is "completed published lessons ÷ published lessons",
   * which is the number every Egyptian platform shows and the only one a
   * student can sanity-check against the outline they are looking at.
   *
   * Per-lesson partial `completion` still exists — it drives the continue-
   * watching bar and future analytics — but averaging partials into the
   * course number would make the headline percentage drift every ten seconds
   * for no informational gain, and would force this aggregate to run on every
   * heartbeat instead of only on a state transition.
   */
  async recalculate(tx: PrismaLike, enrollmentId: string, courseId: string): Promise<number> {
    const [totalLessons, completedLessons] = await Promise.all([
      tx.lesson.count({ where: { courseId, isPublished: true } }),
      tx.lessonProgress.count({
        where: {
          enrollmentId,
          state: { in: ['completed', 'passed'] },
          lesson: { courseId, isPublished: true },
        },
      }),
    ]);

    const percent =
      totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 10_000) / 100;
    const finished = totalLessons > 0 && completedLessons === totalLessons;

    await tx.enrollment.update({
      where: { id: enrollmentId },
      data: {
        progressPercent: percent,
        // `status` deliberately stays `active`. Finishing a course must not
        // drop the enrollment out of the ownership filters and revoke access
        // to the very thing that was just completed.
        completedAt: finished ? new Date() : null,
      },
    });

    return percent;
  }
}
