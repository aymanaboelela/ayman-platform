import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveGate, type GateState } from './gate-rule';

/**
 * Resolves the progression gate for one student and one course.
 *
 * Two queries, never one per lesson: the ordered published lesson list, and
 * that enrollment's progress rows. The rule itself lives in `gate-rule.ts` as
 * a pure function, so the sentence that decides what a student may open is
 * tested against a table rather than a database fixture per case.
 */
@Injectable()
export class LessonGateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param enrollmentId the caller's own enrollment — resolved by
   *   `LessonAccessService` from the session, never from a request parameter.
   */
  async resolveCourse(
    enrollmentId: string,
    courseId: string,
  ): Promise<Map<string, GateState>> {
    const [course, lessons, progress] = await Promise.all([
      this.prisma.course.findUnique({
        where: { id: courseId },
        select: { progressionMode: true, examLessonId: true },
      }),
      // The SAME ordering tuple `PlayerService.orderedLessons` uses. Reordering
      // lessons in the admin is re-pathing the course; there is deliberately no
      // second ordering to keep in sync.
      this.prisma.lesson.findMany({
        where: { courseId, isPublished: true, section: { isPublished: true } },
        orderBy: [{ section: { position: 'asc' } }, { position: 'asc' }, { id: 'asc' }],
        select: { id: true, isFreePreview: true },
      }),
      this.prisma.lessonProgress.findMany({
        where: { enrollmentId },
        select: { lessonId: true, state: true },
      }),
    ]);

    const stateByLesson = new Map(progress.map((row) => [row.lessonId, row.state as string]));

    return resolveGate({
      // A course row that vanished mid-request cannot lock a student out of
      // content: fall open, since the ownership half of the gate has already
      // said yes and this half only ever adds restriction.
      mode: course?.progressionMode ?? 'open',
      examLessonId: course?.examLessonId ?? null,
      lessons: lessons.map((lesson) => ({
        id: lesson.id,
        isFreePreview: lesson.isFreePreview,
        state: stateByLesson.get(lesson.id) ?? 'not_started',
      })),
    });
  }

  /** Convenience for the single-lesson question the access gate asks. */
  async isAvailable(
    enrollmentId: string,
    courseId: string,
    lessonId: string,
  ): Promise<boolean> {
    const gate = await this.resolveCourse(enrollmentId, courseId);
    const state = gate.get(lessonId);
    // A lesson absent from the run is unpublished or belongs to another
    // course. Ownership and publication were already checked by the caller, so
    // this can only be a race with an unpublish — and `undefined` must not read
    // as "available".
    return state === 'available' || state === 'cleared';
  }
}
