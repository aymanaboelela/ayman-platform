import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ESSAY_IMAGE_RETENTION_DAYS } from '@ayman/contracts/daily-essay';
import { PrismaService } from '../../prisma/prisma.service';
import { DailyEssayService } from './daily-essay.service';

/** A bound on one sweep's work, not on the retention — the next run takes the rest. */
const BATCH = 500;

/**
 * The ceiling on an UNMARKED answer's photographs.
 *
 * Marking deletes them at once; this is for the answers nobody got to. A
 * sweep and not a hook because «this picture is thirty days old» becomes true
 * by the passage of time, and the same advisory-lock shape as
 * `HomeworkPurgeService` so one replica does the work and the rest no-op.
 * Its own lock key and its own table: the two sweeps share a storage prefix
 * and nothing else.
 */
@Injectable()
export class DailyEssayPurgeService {
  private readonly logger = new Logger(DailyEssayPurgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly essays: DailyEssayService,
  ) {}

  /** Half an hour after the homework sweep, so the two are never on the object store together. */
  @Cron('30 3 * * *')
  async sweep(): Promise<number> {
    const acquired = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtextextended('ayman:daily-essay:image-purge', 0)) AS locked
      `;
      return rows[0]?.locked === true;
    });
    if (!acquired) return 0;

    const removed = await this.essays.purgeExpiredImages(BATCH);
    if (removed > 0) {
      this.logger.log(
        `daily essay image purge: removed ${removed} image(s) older than ${ESSAY_IMAGE_RETENTION_DAYS} days`,
      );
    }
    return removed;
  }
}
