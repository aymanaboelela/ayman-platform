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
    /**
     * ⚠️ `section: { isPublished: true }` is load-bearing on BOTH counts, and
     * its absence is why a finished course could not reach 100%.
     *
     * A lesson carries its own `isPublished`, and so does its section. The
     * student-facing outline requires both — `player.service.ts` builds every
     * list it shows from `{ courseId, isPublished: true, section: {
     * isPublished: true } }`. This aggregate used to require only the first.
     *
     * So a published lesson inside an UNPUBLISHED section was invisible to the
     * student and impossible for them to open, while still sitting in the
     * denominator here. The student completed every lesson the platform would
     * show them and the course stuck at 90-something percent; `finished` never
     * became true, so `completedAt` was never stamped and the course never
     * moved out of «اللي لسه شغال عليه». Nothing on any screen explained it,
     * because the lessons responsible were the ones deliberately not rendered.
     *
     * The predicate is duplicated rather than imported because the two live in
     * different modules; if a third place needs it, extract it then. What must
     * not happen again is the two DRIFTING — a denominator that counts lessons
     * the numerator can never reach is unsatisfiable by construction.
     */
    /**
     * ⚠️ `kind: { not: 'quiz' }` — the denominator is LECTURES.
     *
     * A quiz is not a lesson a student "does"; it is the check that hangs off
     * the lecture above it, and the final exam is the check on the course. With
     * quizzes in the denominator a three-lecture course read «١ من ٥», the
     * outline numbered the quizzes «المحاضرة ٣» and «المحاضرة ٥», and the
     * headline percentage disagreed with the count beside it — 66.67% next to
     * «٢ / ٥», because the two were computed over different sets.
     *
     * Counting lectures only makes every one of those agree, and it is also the
     * set `resolveGate` walks: what moves the student forward and what counts
     * as progress are now the same list.
     */
    const reachable = {
      courseId,
      isPublished: true,
      section: { isPublished: true },
      kind: { not: 'quiz' as const },
    };

    const [totalLessons, completedLessons] = await Promise.all([
      tx.lesson.count({ where: reachable }),
      tx.lessonProgress.count({
        where: {
          enrollmentId,
          state: { in: ['completed', 'passed'] },
          lesson: reachable,
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
