import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { AdminMobilePending, AdminMobileToday } from '@ayman/contracts/admin/mobile';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { MIRROR_MAX_ATTEMPTS } from '@ayman/contracts/video';
import { rolesWithPermission, userHasPermission } from '../../auth/permissions';
import { isFeatureEnabled } from '../../common/entitlements';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappDeviceService } from '../marketing/whatsapp-device.service';
import { PushService, type PushPayload } from '../notifications/push.service';
import { FinanceDailyService } from '../payments/finance-daily.service';
import { dailySummaryPayload, whatsappChange } from './daily-summary';

const c = copy.notifications;

/** Who may see each queue — the same permissions the queues' own screens and
 *  sidebar badges require. */
type Viewer = (permission: string) => boolean;

/**
 * «لوحة التحكم على الموبايل» — what the admin app does for a phone that the
 * desk screens never had to: put a number on the icon, say once a night how
 * the day went, and speak up when something breaks with nobody looking.
 *
 * ## Why none of these pushes is a notification ROW
 *
 * Every other admin alert is a row first (`emitToPermission`) and a push
 * second, because «فيه طالب مستني» is still true in the morning. These are
 * not: «الواتساب فصل» read at nine the next day may be long fixed, and a
 * summary of yesterday is not news. So they go straight to `PushService` and
 * leave the feed alone — which also means no new `NotificationKind`, and no
 * migration for a message nobody would ever scroll back to.
 *
 * ## Why one replica, in memory
 *
 * Both sweeps take a Postgres advisory lock first, exactly as
 * `SubscriptionExpirySweeper` does, so a second API process no-ops instead of
 * pushing twice. The WhatsApp edge detector keeps its last state in memory:
 * a restart forgets it, and `whatsappChange` treats "nothing seen yet" as
 * "say nothing" rather than paging somebody on every deploy.
 */
@Injectable()
export class AdminMobileService {
  private readonly logger = new Logger(AdminMobileService.name);

  /** The last WhatsApp state that held for two ticks in a row — see `watchWhatsapp`. */
  private whatsappStable: string | null = null;
  /** A state seen once and not yet confirmed by a second read. */
  private whatsappCandidate: string | null = null;
  /** Upload failures at or before this moment have already been told. */
  private videosCheckedAt = new Date();

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly finance: FinanceDailyService,
    private readonly whatsapp: WhatsappDeviceService,
  ) {}

  /** The icon number for one admin — see `AdminMobilePending`. */
  async pending(user: { id: string; role: string }): Promise<AdminMobilePending> {
    return this.queueCounts((permission) => userHasPermission(user.id, user.role, permission));
  }

  /**
   * The four queues the icon counts. Each is the exact `where` its own screen
   * badges with (`payments-alerts`, `wallet-topups-alerts`,
   * `book-orders-alerts`, `homework-alerts`), so the icon and the sidebar
   * never disagree about the same queue.
   */
  private async queueCounts(may: Viewer): Promise<AdminMobilePending> {
    const [payments, walletTopups, bookOrders, homework] = await Promise.all([
      may('payment:read') ? this.prisma.paymentSubmission.count({ where: { status: 'pending' } }) : 0,
      may('payment:read') ? this.prisma.walletTopup.count({ where: { status: 'pending' } }) : 0,
      may('book-order:read') && isFeatureEnabled('books')
        ? this.prisma.bookOrder.count({ where: { deletedAt: null, status: 'paid' } })
        : 0,
      may('homework:read') && isFeatureEnabled('homework')
        ? this.prisma.homeworkSubmission.count({ where: { status: 'submitted' } })
        : 0,
    ]);
    return {
      payments,
      walletTopups,
      bookOrders,
      homework,
      total: payments + walletTopups + bookOrders + homework,
    };
  }

  /**
   * «النهارده» on `/admin` — today so far, cut to what the caller may see.
   * Each part needs the permission its own screen needs, and is `null`
   * without it; see `AdminMobileToday`.
   */
  async today(user: { id: string; role: string }): Promise<AdminMobileToday> {
    const may = (permission: string) => userHasPermission(user.id, user.role, permission);
    const [sales, whatsapp, failedVideos] = await Promise.all([
      may('payment:read')
        ? this.finance
            // `includeBooks` exactly as `AdminFinanceController` decides it, so
            // the band and «الفلوس يوم بيوم» agree on today's net.
            .daily({ days: 1, includeBooks: may('book-order:read') })
            .then(({ totals }) => ({
              count: Math.max(0, totals.subscriptionCount - totals.freeCount),
              newCount: totals.newCount,
              renewalCount: totals.renewalCount,
              netCents: totals.netCents,
            }))
        : null,
      may('marketing:read') && isFeatureEnabled('marketing.whatsapp') && this.whatsapp.enabled
        ? this.whatsapp.status().then((device) => device.state)
        : null,
      may('lesson:write') ? this.failedVideos() : null,
    ]);
    return { sales, whatsapp, failedVideos };
  }

  /** The same rows `watchVideos` pushes about, as a standing list: an upload
   *  that gave up stays here until it is re-uploaded or retried. */
  private async failedVideos(): Promise<NonNullable<AdminMobileToday['failedVideos']>> {
    const where = {
      provider: 'upload',
      mirrorStatus: 'failed',
      mirrorAttempts: { gte: MIRROR_MAX_ATTEMPTS },
    } as const;
    const [count, rows] = await Promise.all([
      this.prisma.lessonVideo.count({ where }),
      this.prisma.lessonVideo.findMany({
        where,
        orderBy: [{ mirrorAt: 'desc' }, { lessonId: 'desc' }],
        select: { lessonId: true, lesson: { select: { title: true } } },
        take: 3,
      }),
    ]);
    return { count, lessons: rows.map((row) => ({ lessonId: row.lessonId, title: row.lesson.title })) };
  }

  /**
   * «ملخص اليوم», at midnight Cairo time, about the day that just closed —
   * asked for at twelve rather than nine, so the evening's sales are in it
   * too. The finance window is taken from an hour BEFORE the tick: at 00:00
   * "today" is already the new, empty day.
   *
   * To `payment:read`, because it is the finance screen's figures; book money
   * is in them only when that same role could read it there.
   */
  @Cron('0 0 * * *', { timeZone: 'Africa/Cairo' })
  async sendDailySummary(): Promise<void> {
    if (!isFeatureEnabled('adminMobile')) return;
    if (!(await this.lock('ayman:admin-mobile:daily-summary'))) return;

    try {
      const roles = rolesWithPermission('payment:read');
      const includeBooks = roles.some((role) => rolesWithPermission('book-order:read').includes(role));
      const [report, queues] = await Promise.all([
        this.finance.daily({ days: 1, includeBooks, now: new Date(Date.now() - 60 * 60 * 1000) }),
        // Everything waiting, whoever could clear it — the summary is a
        // picture of the platform, not of one admin's desk.
        this.queueCounts(() => true),
      ]);
      const paid = report.totals.subscriptionCount - report.totals.freeCount;
      await this.pushToPermission(
        'payment:read',
        dailySummaryPayload({
          subscriptionCount: Math.max(0, paid),
          newCount: report.totals.newCount,
          renewalCount: report.totals.renewalCount,
          netCents: report.totals.netCents,
          pending: queues.total,
        }),
      );
    } catch (error) {
      this.logger.error({ err: error }, 'daily summary failed');
    }
  }

  /** Every five minutes: the two failures nobody sees until a student does. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async watch(): Promise<void> {
    if (!isFeatureEnabled('adminMobile')) return;
    if (!(await this.lock('ayman:admin-mobile:ops-watch'))) return;

    await Promise.all([
      this.watchWhatsapp().catch((error: unknown) =>
        this.logger.warn({ err: error }, 'whatsapp watch failed'),
      ),
      this.watchVideos().catch((error: unknown) =>
        this.logger.warn({ err: error }, 'video watch failed'),
      ),
    ]);
  }

  /**
   * «الواتساب فصل» / «الواتساب رجع».
   *
   * A state has to be read TWICE in a row before it counts. `status()` gives
   * the sidecar four seconds, and one slow answer comes back `unreachable` —
   * alerting on a single read would cry wolf on every hiccup, and the one
   * real outage would arrive already muted.
   */
  async watchWhatsapp(): Promise<void> {
    if (!isFeatureEnabled('marketing.whatsapp') || !this.whatsapp.enabled) return;

    const { state } = await this.whatsapp.status();
    if (state !== this.whatsappCandidate) {
      this.whatsappCandidate = state;
      return;
    }
    const change = whatsappChange(this.whatsappStable, state);
    this.whatsappStable = state;
    if (change === null) return;

    await this.pushToPermission('marketing:read', {
      title: change === 'down' ? c.whatsappDown : c.whatsappBack,
      body: change === 'down' ? c.whatsappDownDetail : c.whatsappBackDetail,
      url: '/admin/marketing/device',
      tag: 'ayman-whatsapp',
    });
  }

  /**
   * «رفع فيديو فشل». Only an UPLOADED lecture, and only once it has used up
   * its retries: a YouTube mirror that fails still plays from YouTube, and an
   * upload on its first failure is retried by `VideoMirrorService` on its
   * own — telling anybody then would be telling them about a problem that
   * usually fixes itself.
   */
  async watchVideos(): Promise<void> {
    const since = this.videosCheckedAt;
    const now = new Date();
    const failed = await this.prisma.lessonVideo.findMany({
      where: {
        provider: 'upload',
        mirrorStatus: 'failed',
        mirrorAttempts: { gte: MIRROR_MAX_ATTEMPTS },
        mirrorAt: { gt: since, lte: now },
      },
      select: { lessonId: true, lesson: { select: { title: true } } },
      take: 5,
    });
    this.videosCheckedAt = now;

    for (const video of failed) {
      await this.pushToPermission('lesson:write', {
        title: formatCopy(c.videoFailed, { lesson: video.lesson.title }),
        body: c.videoFailedDetail,
        url: '/admin/videos',
        // Per lecture: two failures are two different things to fix.
        tag: `ayman-video-${video.lessonId}`,
      });
    }
  }

  /** Every account whose role holds `permission` — the same audience
   *  `emitToPermission` writes rows for. */
  private async pushToPermission(permission: string, payload: PushPayload): Promise<void> {
    const roles = rolesWithPermission(permission);
    if (roles.length === 0) return;
    const users = await this.prisma.user.findMany({
      // Only accounts that ever subscribed a browser: without this every
      // admin row on the stack is a `findMany` in `notifyUser` for nothing.
      where: { role: { in: roles }, pushSubscriptions: { some: {} } },
      select: { id: true },
    });
    await Promise.all(users.map((user) => this.push.notifyUser(user.id, payload)));
  }

  /** One replica runs a sweep; the rest no-op. Same lock shape as
   *  `SubscriptionExpirySweeper`. */
  private async lock(key: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS locked
      `;
      return rows[0]?.locked === true;
    });
  }
}
