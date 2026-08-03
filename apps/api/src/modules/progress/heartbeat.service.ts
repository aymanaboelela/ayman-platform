import { BadRequestException, Injectable } from '@nestjs/common';
import type { HeartbeatRequest, HeartbeatResponse } from '@ayman/contracts';
import {
  allowedHeartbeatSeconds,
  isVideoAutoComplete,
  videoCompletionFraction,
} from '@ayman/contracts/progress';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseProgressService } from './course-progress.service';
import { LessonAccessService } from './lesson-access.service';
import { PROGRESS_SELECT, toProgressDto, type ProgressRow } from './progress.mapper';
import { ViewSessionService } from './view-session.service';

interface LockedProgressRow {
  watched_seconds: number;
  max_position_seconds: number;
  state: string;
  completed_at: Date | null;
  elapsed_seconds: number;
}

@Injectable()
export class HeartbeatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LessonAccessService,
    private readonly courseProgress: CourseProgressService,
    private readonly viewSessions: ViewSessionService,
  ) {}

  /**
   * The highest-frequency authenticated write in the product.
   *
   * Shape: one `SELECT … FOR UPDATE` and one `UPDATE` inside a single
   * interactive transaction. The row lock is what makes the read-modify-write
   * safe against two tabs heartbeating the same lesson — without it, both
   * would read the same `watched_seconds` and the later write would silently
   * discard the earlier one, or worse, double-credit.
   *
   * The rule itself deliberately stays in TypeScript
   * (`@ayman/contracts/progress`) rather than being pushed into the SQL: one
   * tested implementation, called by both the server that enforces it and the
   * client that displays it.
   *
   * `input` is typed `HeartbeatRequest` — `{ position, delta }` and nothing
   * else. There is no code path that reads a client-sent total or percentage;
   * a client claiming `watchedSeconds: 99999` has no field to put it in, and
   * even if one were forced through at the type level, this method never
   * reads it — only `input.position` and `input.delta` are ever touched.
   */
  async record(
    userId: string,
    lessonId: string,
    input: HeartbeatRequest,
  ): Promise<HeartbeatResponse> {
    const context = await this.access.require(userId, lessonId);

    if (context.kind !== 'video') {
      throw new BadRequestException('heartbeats are only accepted for video lessons');
    }

    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<LockedProgressRow[]>`
        SELECT watched_seconds,
               max_position_seconds,
               state::text AS state,
               completed_at,
               EXTRACT(
                 EPOCH FROM (
                   -- Every DateTime column in this schema is Prisma's default
                   -- timestamp(3) WITHOUT time zone, and the driver writes JS
                   -- Date values into it as naive UTC wall-clock time. Bare
                   -- now() is a timestamptz; subtracting it directly from a
                   -- naive column implicitly casts now() through the SESSION's
                   -- timezone (Africa/Cairo, currently UTC+3), which silently
                   -- inflates every gap by exactly that offset. "AT TIME ZONE
                   -- UTC" produces the matching naive UTC value instead.
                   (now() AT TIME ZONE 'UTC') - COALESCE(last_heartbeat_at, first_opened_at, updated_at)
                 )
               )::float8 AS elapsed_seconds
          FROM app.lesson_progress
         WHERE enrollment_id = ${context.enrollmentId}
           AND lesson_id     = ${context.lessonId}
           FOR UPDATE
      `;

      const previous = locked[0];

      // The whole anti-forgery control, in one line: the client's claim is
      // intersected with the time the SERVER measured since it last heard
      // from this row. There is no path where `input.delta` is added raw.
      const granted = allowedHeartbeatSeconds(input.delta, previous?.elapsed_seconds ?? 0);

      const duration = context.durationSeconds;
      const cap = duration > 0 ? duration : Number.MAX_SAFE_INTEGER;

      const watchedSeconds = Math.min((previous?.watched_seconds ?? 0) + granted, cap);
      const maxPositionSeconds = Math.max(
        previous?.max_position_seconds ?? 0,
        Math.min(Math.max(input.position, 0), cap),
      );

      const snapshot = { durationSeconds: duration, watchedSeconds, maxPositionSeconds };
      const wasComplete = previous?.completed_at != null;
      const justCompleted = !wasComplete && isVideoAutoComplete(snapshot);
      const isComplete = wasComplete || justCompleted;
      const now = new Date();

      const completionFields = justCompleted
        ? { completedAt: now, completedVia: 'auto' as const }
        : {};

      // A lesson that was already complete — via auto, dwell, or the manual
      // button — must never regress. Re-deriving `videoCompletionFraction`
      // from THIS heartbeat's snapshot alone would recompute a fraction below
      // 1 whenever the underlying watched/position values haven't themselves
      // reached the auto-complete thresholds (the exact case for a manually
      // or dwell-completed lesson, whose watched_seconds legitimately never
      // gets near duration). Writing that value while `completed_at` stays
      // set would violate `lesson_progress_completed_is_full` — a heartbeat
      // on an already-finished lesson would 500 the moment a student reopens
      // it and lets the video play. `isComplete` pins the value at 1 instead.
      const completion = isComplete ? 1 : videoCompletionFraction(snapshot);

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
          completion,
          state: isComplete ? 'completed' : 'in_progress',
          watchedSeconds,
          maxPositionSeconds,
          openCount: 1,
          firstOpenedAt: now,
          lastHeartbeatAt: now,
          ...completionFields,
        },
        update: {
          completion,
          state: isComplete ? 'completed' : 'in_progress',
          watchedSeconds,
          maxPositionSeconds,
          lastHeartbeatAt: now,
          ...completionFields,
        },
        select: PROGRESS_SELECT,
      });

      // The timeline's row for this sitting, credited the SAME server-granted
      // seconds the total above just took. Inside this transaction and after
      // the `FOR UPDATE` on `lesson_progress`, always in that order — see
      // `ViewSessionService` for why both of those matter.
      await this.viewSessions.credit(tx, {
        enrollmentId: context.enrollmentId,
        lessonId: context.lessonId,
        grantedSeconds: granted,
        now,
      });

      // The course aggregate only moves on a transition, so the common case
      // — a heartbeat mid-lesson — costs exactly the two statements above.
      const courseProgressPercent = justCompleted
        ? await this.courseProgress.recalculate(tx, context.enrollmentId, context.courseId)
        : Number(
            (
              await tx.enrollment.findUniqueOrThrow({
                where: { id: context.enrollmentId },
                select: { progressPercent: true },
              })
            ).progressPercent,
          );

      return {
        progress: toProgressDto(row as ProgressRow),
        justCompleted,
        courseProgressPercent,
      };
    });
  }
}
