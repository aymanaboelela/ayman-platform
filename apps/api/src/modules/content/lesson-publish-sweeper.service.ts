import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';

interface DueLesson {
  id: string;
  title: string;
  course_id: string;
}

/**
 * «المحاضرة تنزل الساعة ٨» — the lecture that publishes itself.
 *
 * ## Why a sweeper and not a read-time gate
 *
 * The obvious implementation is to teach every read "published, OR scheduled
 * and the moment has passed". That is the wrong shape here, and expensively
 * so: `is_published` is tested by the catalogue, the course outline, the
 * player, `LessonAccessService`, the sitemap and the progress path, and each
 * of those would need the same second condition, correctly, forever. One that
 * is missed is a lecture visible where it should not be — and the authorization
 * matrix would need a row per read to prove otherwise.
 *
 * Flipping the flag instead leaves `is_published` as the single fact everything
 * already tests. Scheduling becomes a WRITE that happens at a particular
 * minute, which is a thing this codebase already knows how to do safely
 * (`OverdueService`, `SubscriptionExpirySweeper`), and it adds nothing at all
 * to any access decision.
 *
 * ## The cost of that choice, stated plainly
 *
 * Publication is granular to the minute, not the second, and a lecture due at
 * 20:00 goes live at 20:00:0x. For «المحاضرة تنزل الساعة ٨» that is the
 * correct resolution; for anything needing a hard second boundary (an exam
 * window) the quiz engine's own `open_from` already does it at read time.
 *
 * ## One replica publishes, not four
 *
 * Same `pg_try_advisory_xact_lock` inside a single interactive transaction
 * that `OverdueService` documents at length: a session-level lock taken and
 * released as two separate calls has no guarantee of landing on the same
 * pooled connection, and one that cannot be released leaks until the
 * connection is recycled.
 */
@Injectable()
export class LessonPublishSweeper {
  private readonly logger = new Logger(LessonPublishSweeper.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<number> {
    const due = await this.prisma.$transaction(async (tx) => {
      const lockRows = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtextextended('ayman:content:publish-sweep', 0)) AS locked
      `;
      if (!lockRows[0]?.locked) return [];

      /*
       * `publish_at` is `timestamptz`, so it compares against `now()` directly
       * — no `AT TIME ZONE 'UTC'` dance. That is exactly why the column was
       * given an offset while `quiz_attempts.deadline_at` was not: this value
       * is a wall-clock moment an instructor typed in Cairo, and the database
       * holds the instant it names rather than a bare reading that has to be
       * re-interpreted at every comparison.
       *
       * `is_published = false` is in the WHERE as well as the schedule, so a
       * lecture published by hand in the meantime is not "published" a second
       * time — and it is the same predicate the partial index is built on.
       */
      return tx.$queryRaw<DueLesson[]>`
        SELECT l."id", l."title", l."course_id"
        FROM "app"."lessons" l
        WHERE l."publish_at" IS NOT NULL
          AND l."is_published" = false
          AND l."publish_at" <= now()
        ORDER BY l."publish_at" ASC
        LIMIT 200
      `;
    });

    if (due.length === 0) return 0;

    let published = 0;
    for (const lesson of due) {
      try {
        /*
         * The schedule is CLEARED in the same write that honours it. Leaving
         * it behind would mean an instructor who later unpublishes the lecture
         * to fix something finds it republished within the minute, by a
         * timestamp from last week that nobody remembers setting.
         *
         * `is_published: false` is in the WHERE, not just the SELECT above:
         * between the read and this write a human may have published it
         * themselves, and `updateMany` returning 0 is the correct outcome
         * there rather than a second publish event.
         */
        const result = await this.prisma.lesson.updateMany({
          where: { id: lesson.id, isPublished: false },
          data: { isPublished: true, publishAt: null },
        });
        if (result.count === 0) continue;
        published += 1;

        await this.audit.record({
          action: 'lesson:update',
          resourceType: AUDIT_RESOURCES.lesson,
          resourceId: lesson.id,
          outcome: 'success',
          // No `actorUserId`: nobody pressed anything. The metadata says so,
          // because an audit row for a publish with no actor and no reason is
          // the entry that makes someone think the log is broken.
          metadata: { by: 'schedule', title: lesson.title, courseId: lesson.course_id },
        });
      } catch (error) {
        // One bad row must not stop the rest of the batch — the next tick is
        // sixty seconds away and the others are already late.
        this.logger.error(`scheduled publish failed for ${lesson.id}`, error as Error);
      }
    }

    if (published > 0) {
      this.logger.log(`published ${published} scheduled lesson(s)`);
    }
    return published;
  }
}
