import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { BlockedReason, QuizOverview } from '@ayman/contracts/quiz/overview';
import { PrismaService } from '../../prisma/prisma.service';
import { ACTIVE_ENROLLMENT_STATUSES } from '../enrollment/enrollment.service';
import { LessonAccessService } from '../progress/lesson-access.service';
import { countingAttemptId, decideNextSitting } from './attempt-allowance';

export interface QuizForAttempt {
  id: string;
  lessonId: string;
  courseId: string;
  durationSeconds: number | null;
  openFrom: Date | null;
  openUntil: Date | null;
  allowsImprovement: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  graceSeconds: number;
  overdueHandling: 'autosubmit' | 'graceperiod' | 'autoabandon';
  navMethod: 'free' | 'sequential';
  passPercent: number;
  /** The ORIGINAL paper's total. The improvement paper's is below. */
  sumMarks: number;
  improvementSumMarks: number;
  gradeOutOf: number;
  reviewOptions: unknown;
}

@Injectable()
export class QuizAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lessonAccess: LessonAccessService,
  ) {}

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
        durationSeconds: true,
        openFrom: true,
        openUntil: true,
        allowsImprovement: true,
        shuffleQuestions: true,
        shuffleOptions: true,
        graceSeconds: true,
        overdueHandling: true,
        navMethod: true,
        passPercent: true,
        sumMarks: true,
        improvementSumMarks: true,
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
      improvementSumMarks: Number(quiz.improvementSumMarks),
      gradeOutOf: Number(quiz.gradeOutOf),
    };
  }

  /**
   * The intro screen's read model. Routes through `LessonAccessService`
   * directly (404-shaped) per this file's own note above — a quiz id
   * enumeration over the intro screen is exactly the "no such lesson" vs.
   * "not your lesson" oracle Q-IDOR forbids, so this never returns a 403.
   *
   * Legitimately carries the student's own `scaledScore`/`passed` for PAST,
   * already-finished attempts (never the in-progress one) — the identical
   * "it's already theirs" carve-out `submit`'s own response uses. Never
   * decorated `@NoAnswerLeak()` for that reason.
   */
  async getLessonOverview(userId: string, lessonId: string): Promise<QuizOverview> {
    await this.lessonAccess.require(userId, lessonId);

    const quiz = await this.prisma.quiz.findUnique({
      where: { lessonId },
      select: {
        id: true,
        durationSeconds: true,
        openFrom: true,
        openUntil: true,
        allowsImprovement: true,
        passPercent: true,
        gradeOutOf: true,
        sumMarks: true,
        improvementSumMarks: true,
        isPublished: true,
        slots: {
          select: { paper: true, poolId: true, pool: { select: { pickCount: true } } },
        },
      },
    });
    if (!quiz || !quiz.isPublished) throw new NotFoundException();

    const rows = await this.prisma.quizAttempt.findMany({
      where: { quizId: quiz.id, userId },
      orderBy: { attemptNo: 'desc' },
      select: {
        id: true,
        attemptNo: true,
        paper: true,
        state: true,
        submittedAt: true,
        scaledScore: true,
        passed: true,
        extraAttempts: true,
      },
    });

    const attempts = rows.map((row) => ({
      ...row,
      scaledScore: row.scaledScore === null ? null : Number(row.scaledScore),
    }));

    const now = new Date();
    const sitting = decideNextSitting(quiz.allowsImprovement, attempts);

    let blocked: BlockedReason | null = null;
    if (quiz.openFrom && now < quiz.openFrom) {
      blocked = { code: 'quiz_not_open_yet', availableAt: quiz.openFrom.toISOString() };
    } else if (quiz.openUntil && now >= quiz.openUntil) {
      blocked = { code: 'quiz_closed', availableAt: null };
    } else if (!sitting.allowed) {
      blocked = { code: sitting.reason, availableAt: null };
    }

    const inProgress = attempts.find(
      (attempt) => attempt.state === 'in_progress' || attempt.state === 'overdue',
    );

    /*
     * The count and the total describe the paper the student is ABOUT TO SIT,
     * not the quiz as a whole. Summing both papers would tell a student facing
     * a 10-question original that it has 20 questions and is marked out of
     * double — an exam nobody actually sits.
     */
    const nextPaper = sitting.allowed ? sitting.paper : null;
    const facingPaper = nextPaper ?? 'original';
    const questionCount = quiz.slots
      .filter((slot) => slot.paper === facingPaper)
      .reduce((sum, slot) => sum + (slot.poolId && slot.pool ? slot.pool.pickCount : 1), 0);

    const counting = countingAttemptId(attempts);
    const best = attempts.reduce<number | null>(
      (max, attempt) =>
        attempt.scaledScore === null ? max : max === null ? attempt.scaledScore : Math.max(max, attempt.scaledScore),
      null,
    );

    return {
      quizId: quiz.id,
      lessonId,
      questionCount,
      sumMarks: Number(facingPaper === 'improvement' ? quiz.improvementSumMarks : quiz.sumMarks),
      gradeOutOf: Number(quiz.gradeOutOf),
      durationSeconds: quiz.durationSeconds,
      passPercent: Number(quiz.passPercent),
      attemptsUsed: attempts.length,
      allowsImprovement: quiz.allowsImprovement,
      nextPaper: inProgress ? null : nextPaper,
      bestScore: best,
      inProgressAttemptId: inProgress?.id ?? null,
      blocked: inProgress ? null : blocked,
      attempts: attempts.map((attempt) => ({
        id: attempt.id,
        attemptNo: attempt.attemptNo,
        state: attempt.state,
        paper: attempt.paper,
        submittedAt: attempt.submittedAt?.toISOString() ?? null,
        scaledScore: attempt.scaledScore,
        passed: attempt.passed,
        counts: attempt.id === counting,
      })),
    };
  }
}
