import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  BroadcastCourseOption,
  BroadcastCourseTarget,
  BroadcastTarget,
} from '@ayman/contracts/outreach/broadcast';
import { PrismaService } from '../../prisma/prisma.service';
import { courseAccessScopes } from '../entitlement/grant-liveness';
import { monthSliceOf, sliceCoversMonthlyExam, type MonthScopedGrant } from '../entitlement/month-access';
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

  /**
   * The «طلبة كورس» picker. Drafts are left out — nobody is enrolled in a
   * course that was never published — but archived ones stay: an archived
   * course still has the students who bought it.
   */
  async courses(): Promise<BroadcastCourseOption[]> {
    const rows = await this.prisma.course.findMany({
      where: { status: { not: 'draft' } },
      select: {
        id: true,
        title: true,
        months: { select: { id: true, monthIndex: true, title: true }, orderBy: { monthIndex: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows;
  }

  /**
   * Who a `course` target means. "In the course" is an enrolment row — the
   * same membership `/admin/students?courseId=` lists — and the month
   * question is answered per student by `monthSliceOf`, the function the
   * player opens lectures with. Asking `scope = 'course_month'` directly
   * would call a term or yearly subscriber «مشتركش في شهر ٣» and send them a
   * nudge to buy what they already own.
   */
  private async courseStudentIds(target: BroadcastCourseTarget): Promise<string[]> {
    const course = await this.prisma.course.findUnique({
      where: { id: target.courseId },
      select: { id: true, subjectId: true, requiresGrant: true, months: { select: { id: true } } },
    });
    if (!course) throw new NotFoundException();
    if (target.monthId && !course.months.some((month) => month.id === target.monthId)) {
      throw new NotFoundException();
    }

    const enrolled = await this.prisma.enrollment.findMany({
      where: { courseId: course.id, user: { role: 'student', bannedAt: null } },
      select: { userId: true },
      distinct: ['userId'],
      orderBy: { userId: 'asc' },
    });
    const userIds = enrolled.map((row) => row.userId);
    if (userIds.length === 0 || (target.access === 'any' && !target.paidBefore)) return userIds;

    const grants = await this.prisma.accessGrant.findMany({
      where: { userId: { in: userIds }, OR: courseAccessScopes(course) },
      select: { id: true, userId: true, scope: true, monthId: true, validFrom: true, validUntil: true, revokedAt: true },
      // Newest first — the order `monthSliceOf` documents for its provenance.
      orderBy: [{ validFrom: 'desc' }, { id: 'desc' }],
    });
    const byUser = new Map<string, MonthScopedGrant[]>();
    for (const grant of grants) {
      const list = byUser.get(grant.userId);
      if (list) list.push(grant);
      else byUser.set(grant.userId, [grant]);
    }

    const now = new Date();
    return userIds.filter((userId) => {
      const own = byUser.get(userId) ?? [];
      // «اشترك قبل كده» — any grant this course was ever sold through, live
      // or lapsed. `platform` is the free account every sign-up gets, not a
      // purchase.
      if (target.paidBefore && !own.some((grant) => grant.scope !== 'platform')) return false;
      if (target.access === 'any') return true;

      const slice = monthSliceOf(own, now);
      const covered = target.monthId
        ? slice.everything || slice.monthIds.has(target.monthId)
        : sliceCoversMonthlyExam(slice);
      return target.access === 'has' ? covered : !covered;
    });
  }

  async recipientCount(target: BroadcastTarget): Promise<number> {
    if (target.type === 'course') return (await this.courseStudentIds(target)).length;
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

    // Resolved by the same method `recipientCount` read, so the number the
    // confirm dialog showed is the list that gets the message.
    const userIds =
      target.type === 'course'
        ? await this.courseStudentIds(target)
        : (await this.allStudentIds()).map((row) => row.id);
    void this.deliverAll(userIds, body);
    return { queued: userIds.length };
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
