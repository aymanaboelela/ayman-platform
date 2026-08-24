import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type Redis from 'ioredis';
import {
  cairoParts,
  fromCairoWall,
  maySendAt,
  nextSend,
  rolled,
  withinWindow,
  type Pacing,
  type RunState,
} from '@ayman/contracts/marketing/pacing';
import { renderCampaignBody } from '@ayman/contracts/marketing/render';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { InjectMediaUrl, type MediaUrlResolver } from '../../common/media/media-url';
import { NotOnWhatsAppError, WhatsappDeviceService } from './whatsapp-device.service';
import { pacingOf } from './campaign.service';
import type { MarketingCampaign } from '../../generated/prisma/client';

/**
 * The drip. One message per tick, at most, across the whole platform.
 *
 * ## Why one, and why globally
 *
 * There is ONE phone. Two campaigns running at once would interleave on the
 * same WhatsApp socket and both would exceed their own pacing — the number
 * would see 2× the traffic each campaign thinks it is producing, which is
 * precisely the thing the pacing exists to prevent. So the runner picks the
 * single most-due campaign each tick and ignores the rest; a second campaign
 * simply waits its turn, and its `nextSendAt` drifting into the past is
 * harmless because nothing here treats it as a deadline.
 *
 * ## Why a Redis lock and not `pg_try_advisory_xact_lock`
 *
 * The rest of this codebase reaches for the advisory lock, and it is the
 * right tool there: those sweeps are pure database work measured in
 * milliseconds. This one calls out to a WhatsApp socket and can legitimately
 * take forty seconds. Holding a transaction — and therefore one of the ten
 * connections in the pool every other request shares — open across that call
 * would be a self-inflicted outage under any load at all.
 *
 * The lock fails CLOSED: `enableOfflineQueue: false` means a Redis outage
 * throws rather than queueing, the tick is skipped, and nothing is sent
 * twice. A campaign that pauses during a Redis outage is the correct
 * behaviour and needs no recovery path — the next tick picks it up.
 *
 * ## The tick rate is not the send rate
 *
 * Every ten seconds, and the pacing decides whether anything actually goes
 * out. Making the cron itself the pacing would mean a redeploy could reset a
 * ten-minute batch pause to zero, and would put the safety envelope in a
 * decorator instead of in a tested function.
 */

/** One holder at a time, platform-wide. */
const LOCK_KEY = 'ayman:marketing:runner';
/** Comfortably longer than the send timeout, so a crashed tick self-heals. */
const LOCK_TTL_MS = 90_000;

/** Give up on a recipient after this many device errors and move on. */
const MAX_ATTEMPTS = 3;

/** A skipped recipient costs a short pause, not a full gap — nothing was sent. */
const SKIP_DELAY_MS = 5_000;

@Injectable()
export class CampaignRunner {
  private readonly logger = new Logger(CampaignRunner.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly device: WhatsappDeviceService,
    @Inject(REDIS) private readonly redis: Redis,
    @InjectMediaUrl() private readonly mediaUrl: MediaUrlResolver,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async tick(): Promise<void> {
    if (!this.device.enabled) return;

    let held = false;
    try {
      held = (await this.redis.set(LOCK_KEY, '1', 'PX', LOCK_TTL_MS, 'NX')) === 'OK';
    } catch (error) {
      // Fail closed. See the class note — a skipped tick is free.
      this.logger.warn({ err: error }, 'marketing runner could not take its lock');
      return;
    }
    if (!held) return;

    try {
      await this.step();
    } catch (error) {
      this.logger.error({ err: error }, 'marketing runner tick failed');
    } finally {
      await this.redis.del(LOCK_KEY).catch(() => undefined);
    }
  }

  /** One campaign, one recipient, one outcome. */
  private async step(): Promise<void> {
    const now = new Date();

    const campaign = await this.prisma.marketingCampaign.findFirst({
      where: { status: 'running', nextSendAt: { lte: now } },
      orderBy: { nextSendAt: 'asc' },
    });
    if (!campaign) return;

    const pacing = pacingOf(campaign);
    const state = rolled(stateOf(campaign), now);

    // The stored `nextSendAt` can be stale in two ways a timestamp cannot
    // express: the window may have closed while the row waited, and the daily
    // cap may have been lowered under a running campaign. Both are re-checked
    // here rather than trusted from the row.
    if (!maySendAt(now, pacing, state)) {
      await this.prisma.marketingCampaign.update({
        where: { id: campaign.id },
        data: { ...state, nextSendAt: reopensAt(now, pacing, state) },
      });
      return;
    }

    const recipient = await this.prisma.marketingRecipient.findFirst({
      where: { campaignId: campaign.id, status: 'pending' },
      orderBy: { position: 'asc' },
    });
    if (!recipient) {
      await this.prisma.marketingCampaign.update({
        where: { id: campaign.id },
        data: { status: 'done', nextSendAt: null, finishedAt: now },
      });
      this.logger.log({ campaign: campaign.id }, 'campaign finished');
      return;
    }

    // Re-checked per message, not only when the audience was resolved: a
    // «قف» that arrives on day three has to stop days four and five.
    const optedOut = await this.prisma.marketingOptOut.findUnique({
      where: { phone: recipient.phone },
      select: { phone: true },
    });
    if (optedOut) {
      await this.settle(recipient.id, { status: 'skipped', error: 'طلب إيقاف' });
      await this.reschedule(campaign, new Date(now.getTime() + SKIP_DELAY_MS), state);
      return;
    }

    const image = campaign.imageAssetId
      ? await this.prisma.mediaAsset.findUnique({
          where: { id: campaign.imageAssetId },
          select: { storageKey: true },
        })
      : null;

    const text = renderCampaignBody({
      body: campaign.body,
      name: recipient.name,
      linkUrl: campaign.linkUrl,
    });

    try {
      await this.device.send({
        phone: recipient.phone,
        text,
        imageUrl: image ? this.mediaUrl.resolve(image.storageKey) : null,
      });
    } catch (error) {
      await this.failed(campaign, recipient.id, recipient.attempts, error, now, state);
      return;
    }

    await this.settle(recipient.id, { status: 'sent', sentAt: now });

    const next = nextSend(now, pacing, state, Math.random());
    await this.prisma.marketingCampaign.update({
      where: { id: campaign.id },
      data: {
        nextSendAt: next.at,
        sentInBatch: next.state.sentInBatch,
        sentToday: next.state.sentToday,
        dayKey: next.state.dayKey,
      },
    });
  }

  /**
   * A send that did not happen.
   *
   * Three shapes, and they are genuinely different:
   *
   *   · **not on WhatsApp** — a fact about the number, not a fault. Skipped
   *     immediately, no retries, and it does NOT spend the daily quota:
   *     nothing was delivered to anybody.
   *   · **the device is not connected** — the campaign pauses itself. Marching
   *     four thousand recipients into `failed` because a phone lost its
   *     pairing at 2am is unrecoverable; a paused campaign is one button.
   *   · **anything else** — retried up to `MAX_ATTEMPTS`, then failed, and the
   *     run carries on. One bad number must not stop a campaign.
   */
  private async failed(
    campaign: MarketingCampaign,
    recipientId: string,
    attempts: number,
    error: unknown,
    now: Date,
    state: RunState,
  ): Promise<void> {
    const message = error instanceof Error ? error.message.slice(0, 300) : 'unknown error';

    if (error instanceof NotOnWhatsAppError) {
      await this.settle(recipientId, { status: 'skipped', error: 'الرقم مش على واتساب' });
      await this.reschedule(campaign, new Date(now.getTime() + SKIP_DELAY_MS), state);
      return;
    }

    const device = await this.device.status();
    if (device.state !== 'connected') {
      await this.prisma.marketingCampaign.update({
        where: { id: campaign.id },
        data: { status: 'paused', nextSendAt: null },
      });
      this.logger.error(
        { campaign: campaign.id, device: device.state },
        'campaign paused — the WhatsApp device is not connected',
      );
      return;
    }

    const next = attempts + 1;
    await this.prisma.marketingRecipient.update({
      where: { id: recipientId },
      data: {
        attempts: next,
        error: message,
        ...(next >= MAX_ATTEMPTS ? { status: 'failed' as const } : {}),
      },
    });
    // A full gap even on a failure: retrying a refused message immediately is
    // exactly the pattern that turns one refusal into a block.
    const scheduled = nextSend(now, pacingOf(campaign), state, Math.random());
    await this.prisma.marketingCampaign.update({
      where: { id: campaign.id },
      // The counters do NOT advance — nothing reached anybody, so nothing was
      // spent from the day's allowance.
      data: { nextSendAt: scheduled.at },
    });
  }

  private settle(
    recipientId: string,
    data: { status: 'sent' | 'skipped'; sentAt?: Date; error?: string },
  ): Promise<unknown> {
    return this.prisma.marketingRecipient.update({ where: { id: recipientId }, data });
  }

  private reschedule(campaign: MarketingCampaign, at: Date, state: RunState): Promise<unknown> {
    return this.prisma.marketingCampaign.update({
      where: { id: campaign.id },
      data: { nextSendAt: withinWindow(at, pacingOf(campaign)), ...state },
    });
  }
}

function stateOf(campaign: MarketingCampaign): RunState {
  return {
    sentInBatch: campaign.sentInBatch,
    sentToday: campaign.sentToday,
    dayKey: campaign.dayKey,
  };
}

/**
 * When a campaign that may not send right now may send again.
 *
 * Two reasons it cannot, and they resolve to different times: outside the
 * window is "when the window opens", a spent daily cap is "tomorrow morning"
 * even if the window is still open for hours.
 */
function reopensAt(now: Date, pacing: Pacing, state: RunState): Date {
  if (state.sentToday >= pacing.dailyCap) {
    const today = cairoParts(now);
    const tomorrow = new Date(Date.UTC(today.year, today.month - 1, today.date + 1));
    return fromCairoWall(
      tomorrow.getUTCFullYear(),
      tomorrow.getUTCMonth() + 1,
      tomorrow.getUTCDate(),
      pacing.windowStartHour,
    );
  }
  return withinWindow(now, pacing);
}
