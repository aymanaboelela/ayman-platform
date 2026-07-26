import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ACTIVE_ENROLLMENT_STATUSES } from '../enrollment/enrollment.service';

export interface QuizForAttempt {
  id: string;
  lessonId: string;
  courseId: string;
  mode: 'practice' | 'graded';
  durationSeconds: number | null;
  openFrom: Date | null;
  openUntil: Date | null;
  maxAttempts: number;
  retryCooldownHours: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  graceSeconds: number;
  overdueHandling: 'autosubmit' | 'graceperiod' | 'autoabandon';
  navMethod: 'free' | 'sequential';
  passPercent: number;
  sumMarks: number;
  gradeOutOf: number;
  reviewOptions: unknown;
}

@Injectable()
export class QuizAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ONE query. Enrollment, publication state and the open window are all in
   * the WHERE clause — there is no `findUnique` followed by an `if`, because
   * that is the pattern that gets forgotten on the fortieth endpoint.
   *
   * RECONCILED — the `course.enrollments.some({ userId, status: { in: ... } }})`
   * predicate below is byte-identical to Plan 4's `LessonAccessService.require`
   * (same `ACTIVE_ENROLLMENT_STATUSES` constant). That is deliberate and it is
   * the ONE place it is duplicated, because collapsing quiz publication + open
   * window + attempt limit into `LessonAccessService` would push quiz
   * semantics into the player module. The contract is therefore:
   * `quiz-access.service.spec.ts` asserts that a lesson denied by
   * `LessonAccessService.require` is also denied here, so the two predicates
   * cannot drift. A caller with no active enrollment gets a single generic
   * `quiz_not_accessible` 403 — never a 404 that would distinguish "no such
   * quiz" from "not enrolled", which is an enumeration oracle over the whole
   * catalogue. Every non-attempt quiz read (`GET /api/quiz/lessons/:lessonId`,
   * review, history) routes through `LessonAccessService.require(userId,
   * lessonId)` directly, which IS 404-shaped (Global Constraint — IDOR).
   */
  async assertCanAttempt(userId: string, quizId: string): Promise<QuizForAttempt> {
    const quiz = await this.prisma.quiz.findFirst({
      where: {
        id: quizId,
        isPublished: true,
        lesson: {
          isPublished: true,
          course: {
            status: 'published',
            enrollments: { some: { userId, status: { in: [...ACTIVE_ENROLLMENT_STATUSES] } } },
          },
        },
      },
      select: {
        id: true,
        lessonId: true,
        mode: true,
        durationSeconds: true,
        openFrom: true,
        openUntil: true,
        maxAttempts: true,
        retryCooldownHours: true,
        shuffleQuestions: true,
        shuffleOptions: true,
        graceSeconds: true,
        overdueHandling: true,
        navMethod: true,
        passPercent: true,
        sumMarks: true,
        gradeOutOf: true,
        reviewOptions: true,
        lesson: { select: { courseId: true } },
      },
    });

    if (!quiz) {
      throw new ForbiddenException({ code: 'quiz_not_accessible' });
    }

    const now = new Date();
    if (quiz.openFrom && now < quiz.openFrom) {
      throw new ForbiddenException({ code: 'quiz_not_open_yet', openFrom: quiz.openFrom });
    }
    if (quiz.openUntil && now >= quiz.openUntil) {
      throw new ForbiddenException({ code: 'quiz_closed', openUntil: quiz.openUntil });
    }

    return {
      ...quiz,
      courseId: quiz.lesson.courseId,
      passPercent: Number(quiz.passPercent),
      sumMarks: Number(quiz.sumMarks),
      gradeOutOf: Number(quiz.gradeOutOf),
    };
  }
}
