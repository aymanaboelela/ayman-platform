import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { BroadcastTarget } from '@ayman/contracts/outreach/broadcast';
import { PrismaService } from '../../prisma/prisma.service';
import { OutreachService } from './outreach.service';

/**
 * How many students get an open transaction at once during an "everyone"
 * broadcast.
 *
 * The connection pool this shares with every other request on the API is
 * small (`pg.Pool` at 10 — see `LessonProgressService.recordQuizResultTx`'s
 * own note on that ceiling, from the incident that documented it), so this
 * stays comfortably under it: a broadcast is not the only thing the pool has
 * to serve while it runs.
 */
const BROADCAST_CONCURRENCY = 4;

@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outreach: OutreachService,
  ) {}

  /** Who `{ type: 'all' }` currently means — every non-banned student account,
   *  reachable or not. `GET /recipient-count` and the send path MUST agree on
   *  this list, or the confirm dialog would show a number the send does not
   *  honour. */
  private allStudentIds(): Promise<{ id: string }[]> {
    return this.prisma.user.findMany({
      where: { role: 'student', bannedAt: null },
      select: { id: true },
    });
  }

  async recipientCount(target: BroadcastTarget): Promise<number> {
    if (target.type === 'user') {
      const exists = await this.prisma.user.findFirst({
        where: { id: target.userId, role: 'student', bannedAt: null },
        select: { id: true },
      });
      return exists ? 1 : 0;
    }
    return this.prisma.user.count({ where: { role: 'student', bannedAt: null } });
  }

  /**
   * `{ type: 'user' }` sends and returns synchronously — one write, one
   * transaction, the admin's own request waits for the real result.
   *
   * `{ type: 'all' }` resolves the recipient list, kicks off delivery, and
   * returns the count WITHOUT waiting for every send: a cohort in the
   * thousands at a handful of milliseconds per transaction is still easily
   * tens of seconds, which is a request an admin's own browser — or a proxy
   * in front of it — has no obligation to hold open. The trade is that a
   * failure past the first student is only ever visible in the log, not on
   * screen; see the class comment on `BROADCAST_CONCURRENCY` for the ceiling
   * that keeps the run itself from starving every other request the same
   * pool has to serve while it works through the list.
   */
  async send(target: BroadcastTarget, body: string): Promise<{ queued: number }> {
    if (target.type === 'user') {
      const exists = await this.prisma.user.findFirst({
        where: { id: target.userId, role: 'student', bannedAt: null },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException();

      await this.prisma.$transaction((tx) =>
        this.outreach.sendManual(tx, { userId: target.userId, body }),
      );
      return { queued: 1 };
    }

    const students = await this.allStudentIds();
    void this.deliverAll(
      students.map((row) => row.id),
      body,
    );
    return { queued: students.length };
  }

  /**
   * Not awaited by the caller — see `send`. Errors are swallowed PER STUDENT
   * so one bad row (a deleted account raced against this exact query, say)
   * cannot stop the run for everyone after it in the list.
   */
  private async deliverAll(userIds: string[], body: string): Promise<void> {
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < userIds.length; i += BROADCAST_CONCURRENCY) {
      const chunk = userIds.slice(i, i + BROADCAST_CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map((userId) =>
          this.prisma.$transaction((tx) => this.outreach.sendManual(tx, { userId, body })),
        ),
      );
      for (const result of results) {
        if (result.status === 'fulfilled') sent += 1;
        else {
          failed += 1;
          this.logger.error('broadcast send failed for one recipient', result.reason as Error);
        }
      }
    }

    this.logger.log(`broadcast finished: ${sent} sent, ${failed} failed, ${userIds.length} total`);
  }
}
