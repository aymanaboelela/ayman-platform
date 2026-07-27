import { BadRequestException, Injectable } from '@nestjs/common';
import type { HeartbeatResponse, LessonProgressDto } from '@ayman/contracts';
import { DWELL_COMPLETE_MS } from '@ayman/contracts/progress';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseProgressService } from './course-progress.service';
import { LessonAccessService, type LessonAccessContext } from './lesson-access.service';
import { PROGRESS_SELECT, toProgressDto, type ProgressRow } from './progress.mapper';

/** Kinds a dwell timer may finish. A video is finished by watching it. */
const DWELL_COMPLETABLE_KINDS = new Set(['text', 'attachment']);

@Injectable()
export class LessonProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LessonAccessService,
    private readonly courseProgress: CourseProgressService,
  ) {}

  /**
   * Called once when the player mounts. Two jobs: count the open (a signal
   * admin analytics will want, and the `view_limit` field reserved on
   * `lessons` will eventually enforce against), and write
   * `enrollment.lastLessonId` — which is the entire mechanism behind resume
   * and the dashboard's continue-watching card.
   */
  async open(userId: string, lessonId: string): Promise<LessonProgressDto> {
    const context = await this.access.require(userId, lessonId);
    const now = new Date();

    const [row] = await this.prisma.$transaction([
      this.prisma.lessonProgress.upsert({
        where: {
          enrollmentId_lessonId: {
            enrollmentId: context.enrollmentId,
            lessonId: context.lessonId,
          },
        },
        create: {
          enrollmentId: context.enrollmentId,
          lessonId: context.lessonId,
          state: 'in_progress',
          openCount: 1,
          firstOpenedAt: now,
          lastHeartbeatAt: now,
        },
        update: {
          openCount: { increment: 1 },
          // `firstOpenedAt` is written on create only — it is the dwell rule's
          // one anchor, and re-opening a lesson must not move it.
          lastHeartbeatAt: now,
        },
        select: PROGRESS_SELECT,
      }),
      this.prisma.enrollment.update({
        where: { id: context.enrollmentId },
        data: { lastLessonId: context.lessonId },
        select: { id: true },
      }),
    ]);

    // A completed lesson stays completed when reopened. Prisma has no
    // conditional update expression, so the demotion is avoided by simply
    // never writing `state` on the update branch above; `not_started` rows
    // are moved forward here instead.
    if (row.state === 'not_started') {
      const promoted = await this.prisma.lessonProgress.update({
        where: {
          enrollmentId_lessonId: {
            enrollmentId: context.enrollmentId,
            lessonId: context.lessonId,
          },
        },
        data: { state: 'in_progress' },
        select: PROGRESS_SELECT,
      });
      return toProgressDto(promoted as ProgressRow);
    }

    return toProgressDto(row as ProgressRow);
  }

  /**
   * The 5000ms dwell for text and attachment lessons.
   *
   * Takes no body at all. The elapsed time is measured server-side from
   * `first_opened_at`, so there is no client-reported duration to forge — the
   * fastest possible completion of a text lesson is five real seconds after
   * the open request landed.
   */
  async completeByDwell(userId: string, lessonId: string): Promise<HeartbeatResponse> {
    const context = await this.access.require(userId, lessonId);

    if (!DWELL_COMPLETABLE_KINDS.has(context.kind)) {
      throw new BadRequestException('this lesson kind is not completed by dwelling');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.lessonProgress.findUnique({
        where: {
          enrollmentId_lessonId: {
            enrollmentId: context.enrollmentId,
            lessonId: context.lessonId,
          },
        },
        select: { ...PROGRESS_SELECT, firstOpenedAt: true },
      });

      const openedAt = existing?.firstOpenedAt;
      const elapsedMs = openedAt ? Date.now() - openedAt.getTime() : 0;

      if (!existing || existing.completedAt != null || elapsedMs < DWELL_COMPLETE_MS) {
        // Not an error: the client is allowed to ask early and retry. It just
        // gets the unchanged truth back.
        return this.unchanged(tx, context, existing as ProgressRow | null);
      }

      return this.markComplete(tx, context, 'dwell');
    });
  }

  /**
   * The always-available "أنهيت الدرس · التالي" button (Global Constraint 14).
   *
   * Yes, this lets a student mark a video complete without watching it — and
   * that is deliberate. The point of the dual-threshold rule is not to make
   * completion unreachable, it is to make an *automatic* completion mean
   * something. `completedVia = 'manual'` keeps the two permanently separable,
   * so "how much of this course is actually being watched?" stays answerable.
   */
  async completeManually(userId: string, lessonId: string): Promise<HeartbeatResponse> {
    const context = await this.access.require(userId, lessonId);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.lessonProgress.findUnique({
        where: {
          enrollmentId_lessonId: {
            enrollmentId: context.enrollmentId,
            lessonId: context.lessonId,
          },
        },
        select: PROGRESS_SELECT,
      });

      if (existing?.completedAt != null) {
        // Idempotent: a double-click must not rewrite completedAt or overwrite
        // an `auto` completion with `manual`.
        return this.unchanged(tx, context, existing as ProgressRow);
      }

      return this.markComplete(tx, context, 'manual');
    });
  }

  private async markComplete(
    tx: Prisma.TransactionClient,
    context: LessonAccessContext,
    via: 'manual' | 'dwell',
  ): Promise<HeartbeatResponse> {
    const now = new Date();

    const row = await tx.lessonProgress.upsert({
      where: {
        enrollmentId_lessonId: {
          enrollmentId: context.enrollmentId,
          lessonId: context.lessonId,
        },
      },
      create: {
        enrollmentId: context.enrollmentId,
        lessonId: context.lessonId,
        completion: 1,
        state: 'completed',
        openCount: 1,
        firstOpenedAt: now,
        completedAt: now,
        completedVia: via,
      },
      update: {
        completion: 1,
        state: 'completed',
        completedAt: now,
        completedVia: via,
        // watchedSeconds / maxPositionSeconds are untouched on purpose.
      },
      select: PROGRESS_SELECT,
    });

    const courseProgressPercent = await this.courseProgress.recalculate(
      tx,
      context.enrollmentId,
      context.courseId,
    );

    return {
      progress: toProgressDto(row as ProgressRow),
      justCompleted: true,
      courseProgressPercent,
    };
  }

  /**
   * RECONCILED — required by Plan 5. Called by Plan 5's `AttemptService` on
   * submit/autosubmit and after an appeal regrade. This is the ONLY way a
   * quiz result becomes lesson progress; Plan 5 never writes `lesson_progress`
   * directly, and this method has no HTTP route of its own — exposing one
   * would let a student POST their own pass.
   *
   * `state` becomes `passed` or `failed`, never `completed` — a quiz lesson
   * has a pass/fail axis a video lesson does not, and blending the two would
   * make "did they pass?" and "did they finish?" indistinguishable later.
   * `completion` holds the scaled score (0..1) rather than being forced to 1,
   * which is exactly why `lesson_progress_completed_is_full`'s CHECK carries
   * a `state IN ('passed','failed')` exemption (see the Task 6 migration):
   * an 80%-scoring pass legitimately sets `completed_at` while `completion`
   * is 0.8, not 1.
   *
   * Idempotent: re-recording the identical outcome is a no-op, so a retried
   * autosubmit or a second appeal regrade landing the same result never
   * re-triggers a course-progress recalculation.
   *
   * NOT used by the grading path any more (B1/B2). This standalone,
   * non-`tx` form opens its OWN transaction and re-runs the publication gate
   * (`access.require`) — both fine for a caller with no transaction of its
   * own already open, but fatal for `AttemptService.submit`/`closeOverdue`
   * and `AppealsService.applyOutcome`, which call this from INSIDE their own
   * already-open interactive transaction: `$transaction` there checked out a
   * SECOND pooled connection per call, and ten concurrent submits at one exam
   * deadline wedged the whole `pg.Pool` (max 10) solid — every outer
   * transaction rolled back at its 5s timeout (B1). Worse, re-running
   * `access.require`'s `isPublished`/`course.status` gate mid-grading made an
   * in-flight attempt permanently unsubmittable with a misleading 404 the
   * instant anyone touched publication state (B2). `recordQuizResultTx`
   * below is the fix: it takes the caller's own `tx` AND the already-resolved
   * enrollment/course context, so it never opens a second connection and
   * never re-authorizes a request its caller already authorized. This method
   * is kept for callers with no transaction of their own (direct/manual use);
   * it now simply resolves context once and delegates.
   */
  async recordQuizResult(args: {
    userId: string;
    lessonId: string;
    passed: boolean;
    /** 0..1 */
    scaledScore: number;
    gradeOutOf: number;
  }): Promise<void> {
    const context = await this.access.require(args.userId, args.lessonId);
    await this.prisma.$transaction((tx) =>
      this.recordQuizResultTx(tx, {
        enrollmentId: context.enrollmentId,
        lessonId: context.lessonId,
        courseId: context.courseId,
        passed: args.passed,
        scaledScore: args.scaledScore,
        gradeOutOf: args.gradeOutOf,
      }),
    );
  }

  /**
   * B1/B2 fix. Identical logic to `recordQuizResult`, but runs against the
   * CALLER's own transaction and takes the already-resolved
   * `enrollmentId`/`courseId` directly instead of re-deriving them through
   * `access.require` — the caller (`AttemptService.gradeAndFinalise`,
   * `AppealsService.applyOutcome`) already authorized this request when it
   * started the attempt or looked up the question being appealed; re-running
   * a PUBLICATION check on a progress write nested inside an already-open
   * grading transaction is exactly the bug (B2), not a safety net. Mirrors
   * the existing `recomputeScore`/`recomputeScoreTx` pair.
   */
  async recordQuizResultTx(
    tx: Prisma.TransactionClient,
    args: {
      enrollmentId: string;
      lessonId: string;
      courseId: string;
      passed: boolean;
      /** 0..1 */
      scaledScore: number;
      gradeOutOf: number;
    },
  ): Promise<void> {
    const state = args.passed ? 'passed' : 'failed';
    // Clamped, never trusted verbatim — the same discipline as every other
    // number this module writes.
    const completion = Math.min(Math.max(args.scaledScore, 0), 1);

    const existing = await tx.lessonProgress.findUnique({
      where: {
        enrollmentId_lessonId: {
          enrollmentId: args.enrollmentId,
          lessonId: args.lessonId,
        },
      },
      select: PROGRESS_SELECT,
    });

    if (existing && existing.state === state && Number(existing.completion) === completion) {
      return; // identical outcome already recorded — nothing to do
    }

    const now = new Date();
    // A pass is a completion (Global Constraint 14's spirit extended to
    // quizzes); a fail is not — completedAt/completedVia stay null so a
    // later retake that DOES pass is free to set them.
    const completionFields = args.passed
      ? { completedAt: now, completedVia: 'auto' as const }
      : { completedAt: null, completedVia: null };

    await tx.lessonProgress.upsert({
      where: {
        enrollmentId_lessonId: {
          enrollmentId: args.enrollmentId,
          lessonId: args.lessonId,
        },
      },
      create: {
        enrollmentId: args.enrollmentId,
        lessonId: args.lessonId,
        completion,
        state,
        openCount: 1,
        firstOpenedAt: now,
        ...completionFields,
      },
      update: {
        completion,
        state,
        ...completionFields,
      },
      select: { lessonId: true },
    });

    await this.courseProgress.recalculate(tx, args.enrollmentId, args.courseId);
  }

  private async unchanged(
    tx: Prisma.TransactionClient,
    context: LessonAccessContext,
    row: ProgressRow | null,
  ): Promise<HeartbeatResponse> {
    const enrollment = await tx.enrollment.findUniqueOrThrow({
      where: { id: context.enrollmentId },
      select: { progressPercent: true },
    });

    return {
      progress: row
        ? toProgressDto(row)
        : {
            lessonId: context.lessonId,
            state: 'not_started',
            completion: 0,
            watchedSeconds: 0,
            maxPositionSeconds: 0,
            openCount: 0,
            completedAt: null,
            completedVia: null,
          },
      justCompleted: false,
      courseProgressPercent: Number(enrollment.progressPercent),
    };
  }
}
