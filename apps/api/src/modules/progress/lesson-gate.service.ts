import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { isMonthlyExamLesson } from '@ayman/contracts/quiz/monthly-exam';
import { sliceCoversLesson, sliceCoversMonthlyExam } from '../entitlement/month-access';
import { contentGrantOpening } from '../entitlement/content-access';
import { resolveGate, type GateState } from './gate-rule';

/**
 * Resolves the progression gate for one student and one course.
 *
 * Three queries, never one per lesson: the course row, the ordered published
 * lesson list, and that enrollment's progress rows — plus one more, only on a
 * course that sells by month, for the student's month slice. The rule itself
 * lives in `gate-rule.ts` as a pure function, so the sentence that decides what
 * a student may open is tested against a table rather than a database fixture
 * per case.
 */
@Injectable()
export class LessonGateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlement: EntitlementService,
  ) {}

  /**
   * @param enrollmentId the caller's own enrollment — resolved by
   *   `LessonAccessService` from the session, never from a request parameter.
   * @param userId the same student, for the month slice. Taken separately
   *   rather than read back off the enrollment so this method never has to
   *   trust a caller's enrollment id to identify a person.
   */
  async resolveCourse(
    enrollmentId: string,
    courseId: string,
    userId: string,
  ): Promise<Map<string, GateState>> {
    const [course, lessons, progress, enrollment] = await Promise.all([
      this.prisma.course.findUnique({
        where: { id: courseId },
        // `subjectId` and `requiresGrant` are what `courseAccessScopes` needs;
        // `months: take 1` answers «بيتباع بالشهر أصلًا» without counting nine
        // rows on a course that has them.
        select: {
          examLessonId: true,
          subjectId: true,
          requiresGrant: true,
          months: { select: { id: true }, take: 1 },
        },
      }),
      // The SAME ordering tuple `PlayerService.orderedLessons` uses. Reordering
      // lessons in the admin is re-pathing the course; there is deliberately no
      // second ordering to keep in sync.
      this.prisma.lesson.findMany({
        where: { courseId, isPublished: true, section: { isPublished: true } },
        orderBy: [{ section: { position: 'asc' } }, { position: 'asc' }, { id: 'asc' }],
        // `kind` is read by `resolveGate`: a quiz is not a lecture, and only
        // lectures count toward the exam's prerequisite set. `months` is what
        // the month slice is matched against — selected here rather than in a
        // second query so the outline stays two round trips.
        // `section.title` marks a monthly exam, which is owned by any live
        // subscription rather than by its (absent) month — `isMonthlyExamLesson`.
        select: {
          id: true,
          kind: true,
          sectionId: true,
          months: { select: { monthId: true } },
          section: { select: { title: true } },
        },
      }),
      this.prisma.lessonProgress.findMany({
        where: { enrollmentId },
        select: { lessonId: true, state: true },
      }),
      // `source` only — whether a code minted this enrollment, which is what
      // decides if codes are all this student holds here. By primary key.
      this.prisma.enrollment.findUnique({ where: { id: enrollmentId }, select: { source: true } }),
    ]);

    const stateByLesson = new Map(progress.map((row) => [row.lessonId, row.state as string]));

    /*
     * Which curriculum months this student's subscription opens.
     *
     * Skipped entirely — and every lesson reported as owned — for a course with
     * no months, which is every course until the instructor configures one. So
     * the outline of a course that has not moved over costs exactly the queries
     * it always did, and draws exactly the states it always did.
     */
    const slice =
      course && course.months.length > 0
        ? await this.entitlement.resolveMonthSlice(userId, {
            id: courseId,
            subjectId: course.subjectId,
            requiresGrant: course.requiresGrant,
          })
        : null;

    /*
     * «فتح بكود» — lectures a live code grant names are owned outright, and a
     * student whose only standing here is codes owns nothing else. The same
     * two facts, from the same function, that `LessonAccessService
     * .requireEntitled` decides one lecture with — so a padlock here and a
     * refusal there cannot disagree.
     */
    const subject = course
      ? { id: courseId, subjectId: course.subjectId, requiresGrant: course.requiresGrant }
      : null;
    const content = subject
      ? await this.entitlement.resolveContentAccess(userId, subject, enrollment?.source ?? null)
      : null;

    return resolveGate({
      // A course row that vanished mid-request cannot lock a student out of
      // content: with no exam pointer nothing is gated, since the ownership
      // half of the gate has already said yes and this half only ever adds
      // restriction.
      examLessonId: course?.examLessonId ?? null,
      lessons: lessons.map((lesson) => ({
        id: lesson.id,
        kind: lesson.kind,
        state: stateByLesson.get(lesson.id) ?? 'not_started',
        owned:
          (content !== null && contentGrantOpening(content.slice, lesson) !== null) ||
          (!content?.codeOnly &&
            (slice === null ||
              (isMonthlyExamLesson(lesson.kind, lesson.section.title)
                ? sliceCoversMonthlyExam(slice)
                : sliceCoversLesson(
                    slice,
                    lesson.months.map((row) => row.monthId),
                  )))),
      })),
    });
  }

  /** Convenience for the single-lesson question the access gate asks. */
  async isAvailable(
    enrollmentId: string,
    courseId: string,
    lessonId: string,
    userId: string,
  ): Promise<boolean> {
    const gate = await this.resolveCourse(enrollmentId, courseId, userId);
    const state = gate.get(lessonId);
    // A lesson absent from the run is unpublished or belongs to another
    // course. Ownership and publication were already checked by the caller, so
    // this can only be a race with an unpublish — and `undefined` must not read
    // as "available".
    return state === 'available' || state === 'cleared';
  }
}
