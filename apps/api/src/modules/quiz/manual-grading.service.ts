import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminGradeAnswerInput,
  AdminGradingAttempt,
  AdminGradingQueue,
} from '@ayman/contracts/admin/exams';
import { sanitizeRichText } from '../../common/sanitize/rich-text';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { AttemptService } from './attempt.service';
import { clamp, fractionToState, roundMark } from './grading/fraction';
import { GRADED_STATES } from './analytics.service';

/**
 * التصحيح اليدوي — marking an answer a machine cannot mark.
 *
 * ## This closes a hole that was already open
 *
 * `gradeQuestion` returns `needs_grading` for an essay and never scores it.
 * `needs_grading` is inside `GRADED_STATES`, so the attempt counts as graded
 * everywhere on the platform — in `/api/me/quizzes`, in `MasteryService`, in the
 * admin cohort roster, in item analysis — with that question contributing ZERO.
 *
 * And there was no way to fix it: `AdminAttemptsController` exposed only reopen,
 * extra-time and extra-attempt, and `AttemptService.recomputeScore` /
 * `recomputeScoreTx` existed with **zero callers**. An essay question was a
 * permanent zero, silently, for every student who ever answered one.
 *
 * That was survivable while nothing important rode on it. A monthly exam with an
 * essay in it feeds the honor board, so it stops being survivable: the student
 * who wrote the best answer ranks last.
 *
 * ## Why the write goes through `recomputeScoreTx` and not an UPDATE
 *
 * A mark on one question changes the attempt's `rawScore`, `scaledScore`,
 * `passed` AND `state` (`pending_review` → `submitted` once nothing is left
 * ungraded). `gradeAttempt` is the only thing that knows how, and it reads the
 * attempt's OWN snapshots (`sumMarks`, `gradeOutOf`, `passPercent`) rather than
 * the quiz's live settings — so marking an essay months later rescales against
 * the paper as it was sat, not as it looks now. Both writes are in one
 * transaction: a marked question with a stale total is a score nobody can
 * explain.
 */
@Injectable()
export class ManualGradingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly attempts: AttemptService,
  ) {}

  /** «ورقات محتاجة تصحيح» — without this he has no way to FIND them. */
  async queue(): Promise<AdminGradingQueue> {
    const pending = await this.prisma.attemptQuestion.groupBy({
      by: ['attemptId'],
      where: {
        state: 'needs_grading',
        attempt: { state: { in: [...GRADED_STATES] } },
      },
      _count: { _all: true },
    });
    if (pending.length === 0) return { rows: [] };

    const counts = new Map(pending.map((p) => [p.attemptId, p._count._all]));
    const attempts = await this.prisma.quizAttempt.findMany({
      where: { id: { in: [...counts.keys()] } },
      // Oldest first: a paper waiting three days is more urgent than one that
      // landed a minute ago, and this queue is read to be emptied.
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        submittedAt: true,
        user: { select: { studentProfile: { select: { fullName: true } } } },
        quiz: { select: { lessonId: true, lesson: { select: { title: true } } } },
      },
    });

    return {
      rows: attempts.map((a) => ({
        attemptId: a.id,
        studentName: a.user.studentProfile?.fullName ?? '—',
        quizTitle: a.quiz.lesson.title,
        lessonId: a.quiz.lessonId,
        submittedAt: a.submittedAt?.toISOString() ?? null,
        pendingCount: counts.get(a.id) ?? 0,
      })),
    };
  }

  /**
   * One attempt's ungraded answers.
   *
   * ⚠️ This payload carries the student's written answer and the question stem,
   * so it must never be reachable by a student — it is `attempt:grade`, which is
   * admin-only. It deliberately does NOT carry the model answer: an essay has
   * none to carry, and adding one would put an answer key on a route whose whole
   * job is that a human supplies it.
   */
  async forAttempt(attemptId: string): Promise<AdminGradingAttempt> {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        submittedAt: true,
        scaledScore: true,
        gradeOutOf: true,
        user: { select: { studentProfile: { select: { fullName: true } } } },
        quiz: { select: { lesson: { select: { title: true } } } },
        questions: {
          // Not just what is UNMARKED — also what a human has already marked,
          // so a mark can be revised. «أقدر أعدل على كل حاجة»: a typo'd 3 that
          // can only be corrected by a developer is worse than no screen.
          // MCQs stay out: `gradedBy` is null on anything the engine scored.
          where: { OR: [{ state: 'needs_grading' }, { gradedBy: { not: null } }] },
          orderBy: { slotPosition: 'asc' },
          select: {
            id: true,
            slotPosition: true,
            state: true,
            responseText: true,
            mark: true,
            maxMark: true,
            feedbackHtml: true,
            version: { select: { stemHtml: true } },
          },
        },
      },
    });
    if (!attempt) throw new NotFoundException({ code: 'attempt_not_found' });

    return {
      attemptId: attempt.id,
      studentName: attempt.user.studentProfile?.fullName ?? '—',
      quizTitle: attempt.quiz.lesson.title,
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      gradeOutOf: Number(attempt.gradeOutOf),
      scaledScore: attempt.scaledScore === null ? null : Number(attempt.scaledScore),
      questions: attempt.questions.map((q) => ({
        attemptQuestionId: q.id,
        slotPosition: q.slotPosition,
        questionHtml: q.version.stemHtml,
        responseText: q.responseText,
        maxMark: Number(q.maxMark),
        // Null, not 0. "Unmarked" and "marked zero" are different facts, and
        // this screen exists precisely to turn the first into the second — so
        // the empty box must not arrive pre-filled with a zero nobody typed.
        mark: q.state === 'needs_grading' || q.mark === null ? null : Number(q.mark),
        feedbackHtml: q.feedbackHtml,
      })),
    };
  }

  async grade(
    attemptId: string,
    attemptQuestionId: string,
    input: AdminGradeAnswerInput,
    actorUserId: string,
  ): Promise<{ scaledScore: number | null }> {
    const result = await this.prisma.$transaction(async (tx) => {
      const row = await tx.attemptQuestion.findFirst({
        where: { id: attemptQuestionId, attemptId },
        select: { id: true, maxMark: true, minFraction: true, maxFraction: true },
      });
      if (!row) throw new NotFoundException({ code: 'attempt_question_not_found' });

      const maxMark = Number(row.maxMark);
      if (maxMark <= 0) throw new BadRequestException({ code: 'question_has_no_marks' });

      // Clamped, not rejected: an admin typing 20 into a 5-mark box is a slip,
      // and a 400 in the middle of marking thirty papers is worse than the
      // obvious correction. The clamped value is what the audit row records.
      const mark = roundMark(clamp(input.mark, 0, maxMark));
      const fraction = clamp(mark / maxMark, Number(row.minFraction), Number(row.maxFraction));

      await tx.attemptQuestion.update({
        where: { id: attemptQuestionId },
        data: {
          mark,
          fraction,
          state: fractionToState(fraction),
          feedbackHtml:
            input.feedbackHtml === undefined ? undefined : sanitizeRichText(input.feedbackHtml),
          gradedAt: new Date(),
          // Stamped so the screen can tell a HUMAN mark from an engine one and
          // offer it for revision — `gradedBy` is null on everything
          // `gradeQuestion` scored.
          gradedBy: actorUserId,
        },
      });

      // Same transaction: the question's mark and the attempt's total must move
      // together or the student sees a marked answer inside an unchanged score.
      return this.attempts.recomputeScoreTx(tx, attemptId);
    });

    await this.audit.record({
      action: 'attempt:grade',
      resourceType: AUDIT_RESOURCES.quizAttempt,
      resourceId: attemptId,
      outcome: 'success',
      actorUserId,
      metadata: { attemptQuestionId, mark: input.mark, scaledScore: result.scaledScore },
    });

    return { scaledScore: result.scaledScore };
  }
}
