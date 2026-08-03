import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AttemptEventsService } from './attempt-events.service';
import { AttemptService } from './attempt.service';

export interface AdminAttemptRow {
  id: string;
  userId: string;
  studentName: string;
  quizId: string;
  quizTitle: string;
  attemptNumber: number;
  state: 'in_progress' | 'overdue' | 'submitted' | 'pending_review' | 'abandoned';
  score: number | null;
  startedAt: string;
  submittedAt: string | null;
  deadlineAt: string | null;
}

export interface AdminAttemptFilter {
  quizId?: string;
  userId?: string;
  state?: 'in_progress' | 'overdue' | 'submitted' | 'pending_review' | 'abandoned';
  /** Matches the student's name, case-insensitively. */
  q?: string;
  take?: number;
  skip?: number;
}

/**
 * The escape hatch whose absence generates the competitor's support calls —
 * shipped in the SAME release as the runner (Task 17), not after the first
 * complaint. Every action here is authenticated, permission-gated
 * (`attempt:unlock`) and event-logged, naming the admin as actor.
 */
@Injectable()
export class AttemptAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: AttemptEventsService,
    private readonly attempts: AttemptService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * The ONE place `submitted_at` is ever set back to NULL.
   *
   * This does not weaken Q4. The student-facing submit path still carries
   * `submitted_at IS NULL` in its WHERE clause, so replay-for-a-better-score
   * remains impossible from the browser. Reopening is an authenticated,
   * permission-gated, event-logged act by an admin — which is exactly the
   * escape hatch whose absence generates the competitor's support calls.
   *
   * `extraSeconds` is ADDITIVE (Q3 restated): `deadlineAt` — persisted once
   * at attempt start — is NEVER rewritten here. The student's new hard stop
   * is `deadlineAt + extraTimeSeconds + graceSeconds`, exactly the formula
   * `saveAnswers`/`submit` already enforce.
   */
  async reopen(adminId: string, attemptId: string, args: { extraSeconds: number }): Promise<void> {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      select: { id: true },
    });
    if (!attempt) throw new NotFoundException();

    await this.prisma.$transaction(async (tx) => {
      await tx.quizAttempt.update({
        where: { id: attemptId },
        // M1: `{ increment }` inside the tx, never a read-modify-write of an
        // app-computed sum — two proctors (or a reopen racing a grant) each
        // read the same prior value and clobber one another otherwise, leaving
        // the column and the append-only event log disagreeing on the total.
        data: {
          state: 'in_progress',
          submittedAt: null,
          extraTimeSeconds: { increment: args.extraSeconds },
          lastActivityAt: new Date(),
        },
      });
      // `gradedAt` is what `saveAnswers` checks to keep a practice-mode
      // "checked" question locked (Task 14) — but a normal graded submit
      // stamps it on EVERY question too. Left alone, a reopened student's
      // very first save would hit that same guard and be rejected as
      // "already checked", making the unlock a no-op from their side. The
      // mark/fraction/state themselves are left as-is (that is what "keeps
      // the previous score visible until the student resubmits" means) —
      // the next real `submit()` overwrites all of them anyway via the same
      // `gradeAndStoreQuestion` path a first submit uses.
      await tx.attemptQuestion.updateMany({
        where: { attemptId },
        data: { gradedAt: null },
      });
      await this.events.append(tx, {
        attemptId,
        kind: 'attempt_reopened',
        actorId: adminId,
        payload: { extraSeconds: args.extraSeconds },
      });
    });

    // Rotates the token — kills whatever stale tab still held the old one,
    // exactly like a student's own resume().
    await this.attempts.reissueToken(attemptId);

    // `attempt_events` already records this for the attempt's own timeline.
    // The audit log records it for the ADMIN's timeline — "what did this
    // account do last week" is not answerable from a per-attempt event log.
    await this.audit.record({
      action: 'attempt:unlock',
      resourceType: AUDIT_RESOURCES.quizAttempt,
      resourceId: attemptId,
      actorUserId: adminId,
      outcome: 'success',
      metadata: { operation: 'reopen', extraSeconds: args.extraSeconds },
    });
  }

  /** Additive extra time on a still-open (or reopened) attempt — the
   *  "running low, give them five more minutes" case, no state change. */
  async grantExtraTime(adminId: string, attemptId: string, seconds: number): Promise<void> {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      select: { id: true },
    });
    if (!attempt) throw new NotFoundException();

    await this.prisma.$transaction(async (tx) => {
      await tx.quizAttempt.update({
        where: { id: attemptId },
        // M1: atomic increment, not a read-modify-write (see reopen above).
        data: { extraTimeSeconds: { increment: seconds } },
      });
      await this.events.append(tx, {
        attemptId,
        kind: 'extra_time_granted',
        actorId: adminId,
        payload: { seconds },
      });
    });

    await this.audit.record({
      action: 'attempt:unlock',
      resourceType: AUDIT_RESOURCES.quizAttempt,
      resourceId: attemptId,
      actorUserId: adminId,
      outcome: 'success',
      metadata: { operation: 'grantExtraTime', seconds },
    });
  }

  /**
   * The allowance a student gets is `quiz.maxAttempts + SUM(extraAttempts)`
   * across their own attempts (see `AttemptService.start`) — so a grant is
   * recorded on their MOST RECENT attempt row for this quiz, additive and
   * auditable, never a standalone mutable counter.
   */
  async grantExtraAttempt(adminId: string, quizId: string, userId: string): Promise<void> {
    const latest = await this.prisma.quizAttempt.findFirst({
      where: { quizId, userId },
      orderBy: { attemptNo: 'desc' },
      select: { id: true, quiz: { select: { lessonId: true } } },
    });
    if (!latest) throw new NotFoundException();

    await this.prisma.$transaction(async (tx) => {
      await tx.quizAttempt.update({
        where: { id: latest.id },
        // M1: atomic increment, not a read-modify-write (see reopen above).
        data: { extraAttempts: { increment: 1 } },
      });
      await this.events.append(tx, {
        attemptId: latest.id,
        kind: 'extra_attempt_granted',
        actorId: adminId,
        payload: { quizId, userId },
      });

      // The student asked for this and was never told it was done — the whole
      // reason this kind exists. `userId` is the SUBJECT, deliberately not
      // `adminId`: an admin granting an attempt must not notify themselves.
      await this.notifications.emit(tx, {
        userId,
        kind: 'extra_attempt_granted',
        lessonId: latest.quiz.lessonId,
      });
    });

    await this.audit.record({
      action: 'attempt:unlock',
      resourceType: AUDIT_RESOURCES.quizAttempt,
      resourceId: latest.id,
      actorUserId: adminId,
      outcome: 'success',
      metadata: { operation: 'grantExtraAttempt', quizId, userId },
    });
  }

  /**
   * Cross-quiz by default — `quizId` is one optional facet alongside
   * `userId`/`state`/`q`, never the anchor. `GET .../quizzes/:quizId/attempts`
   * is the same call with `quizId` pre-bound (kept because the builder links
   * straight into it).
   */
  async listAttempts(filter: AdminAttemptFilter = {}): Promise<AdminAttemptRow[]> {
    const rows = await this.prisma.quizAttempt.findMany({
      where: {
        quizId: filter.quizId,
        userId: filter.userId,
        state: filter.state,
        user: filter.q ? { name: { contains: filter.q, mode: 'insensitive' } } : undefined,
      },
      orderBy: { startedAt: 'desc' },
      take: Math.min(filter.take ?? 50, 200),
      skip: filter.skip ?? 0,
      select: {
        id: true,
        userId: true,
        quizId: true,
        attemptNo: true,
        state: true,
        scaledScore: true,
        startedAt: true,
        submittedAt: true,
        deadlineAt: true,
        user: { select: { name: true } },
        quiz: { select: { lesson: { select: { title: true } } } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      studentName: row.user.name,
      quizId: row.quizId,
      quizTitle: row.quiz.lesson.title,
      attemptNumber: row.attemptNo,
      state: row.state,
      score: row.scaledScore === null ? null : Number(row.scaledScore),
      startedAt: row.startedAt.toISOString(),
      submittedAt: row.submittedAt?.toISOString() ?? null,
      deadlineAt: row.deadlineAt?.toISOString() ?? null,
    }));
  }
}
