import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  needsExpiryNotice,
  type AlreadyNotifiedRow,
  type ExpiringCandidate,
} from './subscription-expiry-dedupe';

/** «هيخلص خلال ٣ أيام» — a few days' warning, not a same-day surprise. */
const WARNING_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * How far back to check for an EXISTING notice before writing a new one.
 *
 * Wider than `WARNING_WINDOW_MS` on purpose: a grant enters the warning
 * window and gets notified once, and the sweep must keep recognising that
 * notice as "already sent" for every day the grant sits unrenewed inside the
 * window afterwards — not just the one day it was written on.
 */
const DEDUPE_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

/** Bounds one sweep on a platform of any size — same idea as
 *  `OutreachSweeper`'s per-kind `BATCH`. */
const MAX_CANDIDATES = 1000;

/**
 * Daily sweep: which paid subscriptions are about to lapse, and has this
 * student already been told.
 *
 * Modelled on `OutreachSweeper` — a periodic scan rather than a hook, because
 * "a grant's `validUntil` is now within three days" is a fact that becomes
 * true with the passage of time, not an event anything fires. Safe to run
 * twice: `needsExpiryNotice` is what turns "found again" into a no-op, the
 * same job `outreach_messages_dedupe_key` does there — this table has no
 * such unique index, so the check happens in application code instead of the
 * database, but the shape of the guarantee is the same.
 */
@Injectable()
export class SubscriptionExpirySweeper {
  private readonly logger = new Logger(SubscriptionExpirySweeper.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Once a day is enough — nobody needs to be told twice in one morning
   *  that their subscription is running out. */
  @Cron(CronExpression.EVERY_DAY_AT_10AM)
  async sweep(): Promise<number> {
    // `pg_try_advisory_xact_lock`, exactly as `OutreachSweeper`/`OverdueService`
    // take it and for the same reason: one replica runs the sweep, the rest
    // no-op rather than double-emitting.
    const acquired = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtextextended('ayman:payments:expiry-sweep', 0)) AS locked
      `;
      return rows[0]?.locked === true;
    });
    if (!acquired) return 0;

    const now = new Date();
    const soon = new Date(now.getTime() + WARNING_WINDOW_MS);

    const grants = await this.prisma.accessGrant.findMany({
      where: {
        source: 'purchase',
        scope: 'course',
        revokedAt: null,
        validUntil: { gte: now, lte: soon },
      },
      take: MAX_CANDIDATES,
      select: { userId: true, courseId: true, validUntil: true },
    });

    const candidates: ExpiringCandidate[] = grants
      .filter(
        (grant): grant is typeof grant & { courseId: string; validUntil: Date } =>
          grant.courseId !== null && grant.validUntil !== null,
      )
      .map((grant) => ({
        userId: grant.userId,
        courseId: grant.courseId,
        validUntil: grant.validUntil.toISOString(),
      }));

    if (candidates.length === 0) return 0;

    const existing = await this.prisma.notification.findMany({
      where: {
        kind: 'subscription_expiring_soon',
        userId: { in: [...new Set(candidates.map((candidate) => candidate.userId))] },
        createdAt: { gte: new Date(now.getTime() - DEDUPE_LOOKBACK_MS) },
      },
      select: { userId: true, payload: true },
    });

    const sent: AlreadyNotifiedRow[] = existing
      .map((row) => {
        const payload = row.payload;
        if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
        const record = payload as Record<string, unknown>;
        const courseId = typeof record.courseId === 'string' ? record.courseId : null;
        const validUntil = typeof record.validUntil === 'string' ? record.validUntil : null;
        if (!courseId || !validUntil) return null;
        return { userId: row.userId, courseId, validUntil };
      })
      .filter((row): row is AlreadyNotifiedRow => row !== null);

    const pending = needsExpiryNotice(candidates, sent);

    let sentCount = 0;
    for (const candidate of pending) {
      try {
        await this.prisma.$transaction((tx) =>
          this.notifications.emit(tx, {
            userId: candidate.userId,
            kind: 'subscription_expiring_soon',
            courseId: candidate.courseId,
            validUntil: candidate.validUntil,
          }),
        );
        sentCount += 1;
      } catch (error) {
        // One bad candidate — a course deleted mid-sweep, a stray payload —
        // must not stop the notice from reaching everyone else in the batch.
        this.logger.error(
          { err: error, userId: candidate.userId, courseId: candidate.courseId },
          'subscription expiry notice failed',
        );
      }
    }

    if (sentCount > 0) this.logger.log({ sent: sentCount }, 'subscription expiry notices sent');
    return sentCount;
  }
}
