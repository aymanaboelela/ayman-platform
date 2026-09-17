import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HOMEWORK_IMAGE_RETENTION_DAYS } from '@ayman/contracts/homework';
import { PrismaService } from '../../prisma/prisma.service';
import { HomeworkService } from './homework.service';

/**
 * How many pages one sweep removes.
 *
 * A bound on the work, not on the retention: whatever is left is picked up by
 * the next run, and the run after that, until the backlog is gone. Each delete
 * is a round trip to the object store, so an unbounded sweep on a platform with
 * a term's worth of unmarked homework in it would hold one connection for
 * minutes and time out somewhere unhelpful. Same reasoning as
 * `OutreachSweeper`'s per-kind `BATCH`.
 */
const BATCH = 500;

/**
 * The thirty-day ceiling on a homework photograph.
 *
 * «طيب، وبرضه حصل حاجة بعد ٣٠ يوم برضه لو في صور شيلها… وعايزها برضه حتى من
 *  الـstorage.»
 *
 * ## Why a sweep and not a hook
 *
 * "This picture is thirty days old" becomes true with the passage of time.
 * Nothing fires an event when it does, so there is nothing to hook. Same shape
 * as `SubscriptionExpirySweeper` and `OutreachSweeper`, and it takes the same
 * advisory lock for the same reason: one replica does the work and the rest
 * no-op, rather than every replica racing to delete the same objects.
 *
 * ## Safe to run twice
 *
 * The rows are deleted inside a transaction and the objects afterwards, so a
 * second run finds no rows for anything the first one finished. A run that
 * crashed between the two leaves objects nothing references — invisible to
 * this sweep, costing storage and nothing else — which is the failure this
 * ordering deliberately chooses over the visible one. See
 * `HomeworkService.deleteObjects`.
 *
 * ## What this does NOT reach
 *
 * The database BACKUPS. Those are Dokploy-scheduled dumps sitting in R2, and
 * they contain the `homework_images` ROWS (keys and sizes) but never the image
 * bytes, which were only ever in the bucket — so a restored backup comes back
 * with rows pointing at objects that are gone, not with the photographs. The
 * bucket itself is not versioned, so a delete here is the last copy. That is
 * the intended reading of «حتى من الـstorage»: the only place the pictures ever
 * existed is the place this empties.
 */
@Injectable()
export class HomeworkPurgeService {
  private readonly logger = new Logger(HomeworkPurgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly homework: HomeworkService,
  ) {}

  /** Once a day, in the small hours: nothing about this is urgent to the
   *  minute, and it is the one job here that talks to the object store in bulk. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async sweep(): Promise<number> {
    const acquired = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtextextended('ayman:homework:image-purge', 0)) AS locked
      `;
      return rows[0]?.locked === true;
    });
    if (!acquired) return 0;

    const removed = await this.homework.purgeExpiredImages(BATCH);
    if (removed > 0) {
      this.logger.log(
        `homework image purge: removed ${removed} image(s) older than ${HOMEWORK_IMAGE_RETENTION_DAYS} days`,
      );
    }
    return removed;
  }
}
