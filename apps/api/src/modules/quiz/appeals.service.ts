import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AppealStatus } from '../../generated/prisma/enums';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { LessonAccessService } from '../progress/lesson-access.service';
import { LessonProgressService } from '../progress/lesson-progress.service';
import { AttemptEventsService } from './attempt-events.service';
import { AttemptService } from './attempt.service';
import { clamp, fractionToState, roundMark } from './grading';

export interface AdminAppealRow {
  id: string;
  attemptId: string;
  attemptQuestionId: string;
  questionVersionId: string;
  userId: string;
  studentName: string;
  quizId: string;
  quizTitle: string;
  reasonAr: string;
  state: AppealStatus;
  resolutionAr: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface StudentAppealRow {
  attemptQuestionId: string;
  state: AppealStatus;
  /** "الدرجة قبل التظلم" / "الدرجة بعد التظلم" — the trust signal parents
   *  notice. `gradeAfter` is `null` until resolved (or if rejected). */
  gradeBefore: number;
  gradeAfter: number | null;
  resolverNote: string | null;
}

export interface AdminAppealFilter {
  status?: AppealStatus;
  take?: number;
  skip?: number;
}

interface ResolveInput {
  status: 'accepted' | 'rejected';
  newMark?: number;
  resolverNote: string;
}

/**
 * One regrade primitive (`applyRegrade`, private below), used by BOTH
 * `resolve()` (an appeal-driven regrade) and `gradeManually()` (a manual
 * essay mark with no appeal attached) — the exact same audit shape either way.
 */
@Injectable()
export class AppealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: AttemptEventsService,
    private readonly attempts: AttemptService,
    private readonly progress: LessonProgressService,
    private readonly audit: AuditService,
    private readonly lessonAccess: LessonAccessService,
  ) {}

  /**
   * The mark AT THE MOMENT OF APPEAL is frozen into `gradeBefore` — a later
   * regrade must not rewrite what the student was actually disputing.
   */
  async open(userId: string, attemptQuestionId: string, note: string): Promise<string> {
    const question = await this.prisma.attemptQuestion.findFirst({
      where: { id: attemptQuestionId, attempt: { userId } },
      select: {
        id: true,
        mark: true,
        attemptId: true,
        attempt: { select: { submittedAt: true, quiz: { select: { lessonId: true } } } },
        appeals: { where: { status: { in: ['open', 'under_review'] } }, select: { id: true }, take: 1 },
      },
    });
    // Ownership is compiled into the WHERE clause (`attempt: { userId }`) —
    // another student's question and a nonexistent id are indistinguishable.
    if (!question) throw new NotFoundException();
    // I3: a revoked student (or an unpublished lesson/course) must not be able
    // to open new appeals either — gate on live access, not just ownership.
    // The attempt already exists, so the gate already said yes once. Appealing
    // its grade must not depend on the lesson still being reachable today.
    await this.lessonAccess.requireOwnership(userId, question.attempt.quiz.lessonId);
    if (!question.attempt.submittedAt) {
      throw new ConflictException({ code: 'attempt_not_submitted' });
    }
    if (question.appeals.length > 0) {
      throw new ConflictException({ code: 'appeal_already_open' });
    }

    return this.prisma.$transaction(async (tx) => {
      const appeal = await tx.gradeAppeal.create({
        data: {
          attemptQuestionId,
          studentNote: note,
          gradeBefore: question.mark ?? 0,
          status: 'open',
        },
        select: { id: true },
      });

      await this.events.append(tx, {
        attemptId: question.attemptId,
        attemptQuestionId,
        kind: 'appeal_opened',
        actorId: userId,
        payload: { appealId: appeal.id },
      });

      return appeal.id;
    });
  }

  /**
   * ONE transaction for the whole outcome — mark rewrite (when accepting),
   * the attempt's DERIVED score (`AttemptService.recomputeScoreTx`, never
   * patched directly), `LessonProgressService.recordQuizResult` so a
   * newly-passing student actually unlocks what passing unlocks, the
   * appeal row itself, and both audit events. `appealId: null` is
   * `gradeManually`'s path — a manual essay mark with no appeal attached,
   * through the exact same primitive.
   */
  private async applyOutcome(
    adminId: string,
    attemptQuestionId: string,
    appealId: string | null,
    outcome: { accept: true; newMark: number; resolverNote?: string } | { accept: false; resolverNote: string },
  ): Promise<{ markBefore: number | null; markAfter: number | null }> {
    return this.prisma.$transaction(async (tx) => {
      const question = await tx.attemptQuestion.findUniqueOrThrow({
        where: { id: attemptQuestionId },
        select: {
          id: true,
          attemptId: true,
          mark: true,
          maxMark: true,
          minFraction: true,
          maxFraction: true,
        },
      });
      const markBefore = question.mark === null ? null : Number(question.mark);
      let markAfter: number | null = null;

      if (outcome.accept) {
        const maxMark = Number(question.maxMark);
        if (outcome.newMark < 0 || outcome.newMark > maxMark) {
          throw new BadRequestException({ code: 'new_mark_out_of_range' });
        }
        const rawFraction = maxMark > 0 ? outcome.newMark / maxMark : 0;
        const boundedFraction = clamp(rawFraction, Number(question.minFraction), Number(question.maxFraction));
        markAfter = roundMark(boundedFraction * maxMark);

        await tx.attemptQuestion.update({
          where: { id: attemptQuestionId },
          data: {
            fraction: boundedFraction,
            mark: markAfter,
            state: fractionToState(boundedFraction),
            gradedBy: adminId,
            gradedAt: new Date(),
          },
        });

        await this.events.append(tx, {
          attemptId: question.attemptId,
          attemptQuestionId,
          kind: 'regraded',
          actorId: adminId,
          payload: { markBefore, markAfter, appealId },
        });

        // The attempt score is DERIVED, never patched directly.
        const summary = await this.attempts.recomputeScoreTx(tx, question.attemptId);

        // B1/B2: `recordQuizResultTx`, through THIS same transaction — not a
        // second `$transaction` (which would check out a second pooled
        // connection and could deadlock/wedge alongside the outer one), and
        // no re-run of the publication gate (`access.require`) this deep
        // inside an already-authorized appeal-resolution transaction. See
        // the identical reasoning in `AttemptService.gradeAndFinalise`.
        const enrollment = await tx.enrollment.findFirst({
          where: { userId: summary.userId, courseId: summary.courseId },
          select: { id: true },
        });
        if (enrollment) {
          await this.progress.recordQuizResultTx(tx, {
            enrollmentId: enrollment.id,
            lessonId: summary.lessonId,
            courseId: summary.courseId,
            passed: summary.passed,
            scaledScore: summary.scaledScore / (summary.gradeOutOf || 1),
            gradeOutOf: summary.gradeOutOf,
          });
        }
      }

      if (appealId) {
        await tx.gradeAppeal.update({
          where: { id: appealId },
          data: {
            status: outcome.accept ? 'accepted' : 'rejected',
            gradeAfter: outcome.accept ? markAfter : undefined,
            resolverNote: outcome.resolverNote,
            resolvedBy: adminId,
            resolvedAt: new Date(),
          },
        });
        await this.events.append(tx, {
          attemptId: question.attemptId,
          kind: 'appeal_resolved',
          actorId: adminId,
          payload: { appealId, status: outcome.accept ? 'accepted' : 'rejected' },
        });
      }

      return { markBefore, markAfter };
    });
  }

  async resolve(adminId: string, appealId: string, input: ResolveInput): Promise<void> {
    const appeal = await this.prisma.gradeAppeal.findUnique({
      where: { id: appealId },
      select: { id: true, status: true, attemptQuestionId: true },
    });
    if (!appeal) throw new NotFoundException();
    // Idempotent: resolving an already-resolved appeal is 409, never a
    // silent no-op and never a second regrade of the same dispute.
    if (appeal.status === 'accepted' || appeal.status === 'rejected') {
      throw new ConflictException({ code: 'appeal_already_resolved' });
    }

    if (input.status === 'rejected') {
      // Rejecting changes NO mark at all.
      await this.applyOutcome(adminId, appeal.attemptQuestionId, appealId, {
        accept: false,
        resolverNote: input.resolverNote,
      });
      await this.audit.record({
        action: 'appeal:resolve',
        resourceType: AUDIT_RESOURCES.gradeAppeal,
        resourceId: appealId,
        outcome: 'success',
        metadata: { status: 'rejected', attemptQuestionId: appeal.attemptQuestionId },
      });
      return;
    }

    if (input.newMark === undefined) {
      throw new BadRequestException({ code: 'new_mark_required' });
    }

    await this.applyOutcome(adminId, appeal.attemptQuestionId, appealId, {
      accept: true,
      newMark: input.newMark,
      resolverNote: input.resolverNote,
    });

    // Two entries on purpose: accepting an appeal IS a mark override, and the
    // override must be findable by anyone auditing grade changes without
    // knowing an appeal was involved.
    await this.audit.record({
      action: 'quiz:answer-edit',
      resourceType: AUDIT_RESOURCES.gradeAppeal,
      resourceId: appeal.attemptQuestionId,
      outcome: 'success',
      metadata: { appealId, newMark: input.newMark },
    });
    await this.audit.record({
      action: 'appeal:resolve',
      resourceType: AUDIT_RESOURCES.gradeAppeal,
      resourceId: appealId,
      outcome: 'success',
      metadata: { status: 'accepted', attemptQuestionId: appeal.attemptQuestionId },
    });
  }

  /**
   * A manual essay grade with NO appeal attached — the exact same regrade
   * primitive, not a special case. Not wired to any HTTP route yet (no task
   * in this plan needs one); kept as a documented, tested seam for the essay
   * grading queue.
   */
  async gradeManually(adminId: string, attemptQuestionId: string, mark: number): Promise<void> {
    await this.applyOutcome(adminId, attemptQuestionId, null, { accept: true, newMark: mark });
  }

  private static readonly ADMIN_ROW_SELECT = {
    id: true,
    studentNote: true,
    status: true,
    resolverNote: true,
    resolvedBy: true,
    resolvedAt: true,
    createdAt: true,
    attemptQuestion: {
      select: {
        id: true,
        questionVersionId: true,
        attempt: {
          select: {
            id: true,
            quizId: true,
            user: { select: { id: true, name: true } },
            quiz: { select: { lesson: { select: { title: true } } } },
          },
        },
      },
    },
  } as const;

  private toAdminRow(row: {
    id: string;
    studentNote: string;
    status: AppealStatus;
    resolverNote: string | null;
    resolvedBy: string | null;
    resolvedAt: Date | null;
    createdAt: Date;
    attemptQuestion: {
      id: string;
      questionVersionId: string;
      attempt: {
        id: string;
        quizId: string;
        user: { id: string; name: string };
        quiz: { lesson: { title: string } };
      };
    };
  }): AdminAppealRow {
    return {
      id: row.id,
      attemptId: row.attemptQuestion.attempt.id,
      attemptQuestionId: row.attemptQuestion.id,
      questionVersionId: row.attemptQuestion.questionVersionId,
      userId: row.attemptQuestion.attempt.user.id,
      studentName: row.attemptQuestion.attempt.user.name,
      quizId: row.attemptQuestion.attempt.quizId,
      quizTitle: row.attemptQuestion.attempt.quiz.lesson.title,
      reasonAr: row.studentNote,
      state: row.status,
      resolutionAr: row.resolverNote,
      resolvedBy: row.resolvedBy,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listForAdmin(filter: AdminAppealFilter = {}): Promise<AdminAppealRow[]> {
    const rows = await this.prisma.gradeAppeal.findMany({
      where: filter.status ? { status: filter.status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(filter.take ?? 50, 200),
      skip: filter.skip ?? 0,
      select: AppealsService.ADMIN_ROW_SELECT,
    });
    return rows.map((row) => this.toAdminRow(row));
  }

  /** The single row the resolve endpoint hands back — never derived from a
   *  "most recent" query, always the exact appeal that was just acted on. */
  async getForAdmin(appealId: string): Promise<AdminAppealRow> {
    const row = await this.prisma.gradeAppeal.findUniqueOrThrow({
      where: { id: appealId },
      select: AppealsService.ADMIN_ROW_SELECT,
    });
    return this.toAdminRow(row);
  }

  /** Minimal shape the review screen needs: "is there already an open
   *  appeal on this question?" — scoped to the caller's OWN appeals only. */
  /**
   * Scoped to ONE attempt, not "every appeal this student has ever filed" —
   * `attemptId` is a real ownership boundary here, not a decorative path
   * segment. Ownership is compiled into the WHERE clause
   * (`attempt: { id: attemptId, userId }`), so another student's attempt id
   * and a nonexistent one are indistinguishable: both return an empty array
   * rather than leaking whether the id belongs to someone else. The caller
   * (the review page) only ever needs "is MY appeal on THIS attempt already
   * open" — silently returning a stranger's appeals for a mistyped/foreign
   * id would be wrong even though it's never MORE than the caller's own data.
   */
  async listForStudent(userId: string, attemptId: string): Promise<StudentAppealRow[]> {
    // Ownership check FIRST and separately — consistent with every other
    // attempt-scoped learner route: another student's attempt id is a 404,
    // never a 200 with an empty (or, before this fix, a wrong) list.
    const owned = await this.prisma.quizAttempt.findFirst({
      where: { id: attemptId, userId },
      select: { quiz: { select: { lessonId: true } } },
    });
    if (!owned) throw new NotFoundException();
    // I3: revocation/unpublish removes read access, not just a delete would.
    await this.lessonAccess.requireOwnership(userId, owned.quiz.lessonId);

    const rows = await this.prisma.gradeAppeal.findMany({
      where: { attemptQuestion: { attempt: { id: attemptId, userId } } },
      select: {
        attemptQuestionId: true,
        status: true,
        gradeBefore: true,
        gradeAfter: true,
        resolverNote: true,
      },
    });
    return rows.map((row) => ({
      attemptQuestionId: row.attemptQuestionId,
      state: row.status,
      gradeBefore: Number(row.gradeBefore),
      gradeAfter: row.gradeAfter === null ? null : Number(row.gradeAfter),
      resolverNote: row.resolverNote,
    }));
  }
}
