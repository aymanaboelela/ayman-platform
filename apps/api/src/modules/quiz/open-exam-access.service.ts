import { Injectable } from '@nestjs/common';
import { MONTHLY_EXAM_LESSON } from '@ayman/contracts/quiz/monthly-exam';
import { Prisma } from '../../generated/prisma/client';
import { isPrismaDataValidationError } from '../../common/prisma/prisma-errors';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * «امتحان مفتوح لغير المشتركين» — who may sit a monthly exam WITHOUT an
 * enrollment in its course.
 *
 * ## The audience is the course's own cohort, read off the student's profile
 *
 * A course already says who it is for: `systemId` + `year` + `forGeneral` /
 * `forLanguages`. The owner's rule is «طلاب تانية بكالوريا عربي على حسب نوع
 * الامتحان», i.e. exactly that triple, matched against what the student told
 * onboarding. A profile missing any of the three is NOT admitted («ما
 * يظهرلهمش»): `year` and `schoolStream` are nullable for students who predate
 * those questions, and admitting them would be guessing which cohort they are.
 *
 * ## Why this is a side door and not an enrollment
 *
 * An enrollment row is the key to the WHOLE course — `LessonAccessService.
 * resolve` asks for nothing more, and a `requiresGrant` course does not evict
 * a student who is already enrolled. Minting one so a student can sit one paper
 * would hand them every lecture. So nothing here writes; it answers one yes/no
 * for the three doors a sitting needs — the intro page, start/resume, and the
 * review of their own attempt — and every other door keeps its enrollment gate.
 *
 * ## Why it skips the entitlement checks
 *
 * Month, term, code-only and lapsed-grant refusals all describe what a
 * SUBSCRIPTION covers. An open exam is, by the owner's choice, covered by none
 * of them — so an enrolled student whose grant lapsed sits it too, through this
 * same door, rather than meeting «اشتراكك خلص» on a paper that is free.
 */
@Injectable()
export class OpenExamAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The course filter a student's profile admits them to, or `null` when the
   * profile cannot place them in a cohort at all. Shared by the gate below and
   * by `/api/me/exams`, so the list never shows an exam the door then refuses.
   */
  async audienceCourseWhere(userId: string): Promise<Prisma.CourseWhereInput | null> {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
      select: { systemId: true, year: true, schoolStream: true },
    });
    if (!profile?.systemId || profile.year === null || !profile.schoolStream) return null;
    return {
      status: 'published',
      systemId: profile.systemId,
      year: profile.year,
      ...(profile.schoolStream === 'general' ? { forGeneral: true } : { forLanguages: true }),
    };
  }

  /** The lesson-side half of the rule: a published, open, monthly exam on a
   *  published shelf, in a course the profile admits. */
  private openExamLessonWhere(
    course: Prisma.CourseWhereInput,
    quizId?: string,
  ): Prisma.LessonWhereInput {
    return {
      kind: MONTHLY_EXAM_LESSON.kind,
      isPublished: true,
      section: { title: MONTHLY_EXAM_LESSON.section.title, isPublished: true },
      quiz: { ...(quizId === undefined ? {} : { id: quizId }), isPublished: true, openToNonSubscribers: true },
      course,
    };
  }

  async admitsLesson(userId: string, lessonId: string): Promise<boolean> {
    const course = await this.audienceCourseWhere(userId);
    if (!course) return false;
    const hit = await this.prisma.lesson
      .findFirst({ where: { id: lessonId, ...this.openExamLessonWhere(course) }, select: { id: true } })
      // A raw route param that is not uuid-shaped is "no such exam", the
      // same answer `LessonAccessService.resolve` gives it.
      .catch(notUuid);
    return hit !== null;
  }

  async admitsQuiz(userId: string, quizId: string): Promise<boolean> {
    const course = await this.audienceCourseWhere(userId);
    if (!course) return false;
    const hit = await this.prisma.lesson
      .findFirst({
        where: this.openExamLessonWhere(course, quizId),
        select: { id: true },
      })
      .catch(notUuid);
    return hit !== null;
  }
}

function notUuid(error: unknown): null {
  if (isPrismaDataValidationError(error)) return null;
  throw error;
}
