import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { AttemptService } from './attempt.service';

interface OverdueCandidate {
  id: string;
}

@Injectable()
export class OverdueService {
  private readonly logger = new Logger(OverdueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attempts: AttemptService,
  ) {}

  /**
   * A student who closes the laptop still gets graded. Lazy closure on the
   * next read would leave that attempt `in_progress` forever, which is both
   * a wrong grade (or no grade at all) and a stuck "you have an attempt in
   * progress" banner blocking a retake.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<number> {
    // A single advisory lock so a second replica no-ops instead of double
    // grading — the same class of bug as an in-memory rate limiter
    // multiplying its limit across replicas. `pg_try_advisory_xact_lock`
    // (NOT the session-level variant) is acquired and released inside ONE
    // Prisma interactive transaction, which Prisma guarantees runs on a
    // single physical connection: a session-level lock/unlock pair issued as
    // two separate `$queryRaw` calls has no such guarantee under a pooled
    // driver adapter, and a lock acquired on one pooled connection can never
    // be released from another — it would simply leak until that connection
    // is recycled.
    const candidates = await this.prisma.$transaction(async (tx) => {
      const lockRows = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtextextended('ayman:quiz:overdue-sweep', 0)) AS locked
      `;
      if (!lockRows[0]?.locked) return [];

      // H2: `deadline_at` is a naive timestamp(3) storing UTC wall-clock;
      // comparing it directly against `now()` (a timestamptz) would silently
      // inflate elapsed time by the session's UTC offset. Both sides are cast
      // through `(now() AT TIME ZONE 'UTC')`.
      return tx.$queryRaw<OverdueCandidate[]>`
        SELECT a."id"
        FROM "app"."quiz_attempts" a
        JOIN "app"."quizzes" q ON q."id" = a."quiz_id"
        WHERE a."state" IN ('in_progress', 'overdue')
          AND a."submitted_at" IS NULL
          AND a."deadline_at" IS NOT NULL
          AND a."deadline_at"
              + make_interval(secs => a."extra_time_seconds" + q."grace_seconds")
              < (now() AT TIME ZONE 'UTC')
        LIMIT 500
      `;
    });

    let closed = 0;
    for (const candidate of candidates) {
      try {
        const outcome = await this.attempts.closeOverdue(candidate.id);
        if (outcome !== null) closed += 1;
      } catch (error) {
        // One bad attempt must not stop the sweep for everyone else.
        this.logger.error(`overdue sweep failed for attempt ${candidate.id}`, error as Error);
      }
    }
    return closed;
  }
}
