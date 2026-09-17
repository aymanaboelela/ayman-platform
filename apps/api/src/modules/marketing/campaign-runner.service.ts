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
import { NotOnWhatsAppError, WhatsappDeviceService, type SendResult } from './whatsapp-device.service';
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

/**
 * ⚠️ THE DEAD-MAN'S SWITCH. Read this before touching either constant.
 *
 * WhatsApp accepting a message and never delivering it is a real failure mode
 * and it is completely silent: `send()` resolves, the row goes `sent`, the
 * screen says «اتبعت», and nothing anywhere is red. It ran that way through an
 * entire seventy-four-recipient campaign in 2026-09 — every message accepted,
 * none delivered — and was found by the instructor noticing one grey tick on
 * his own phone, not by the platform.
 *
 * Now that receipts are recorded (`WhatsappReceiptController`), their ABSENCE
 * is evidence. If the first `BLIND_SEND_PROBE` messages of a run have all been
 * sitting sent for longer than `BLIND_SEND_GRACE_MS` with no device ever
 * acknowledging one, something is wrong with sending itself and the remaining
 * four thousand recipients must not be spent proving it again.
 *
 * The two numbers are a trade between a false pause and a wasted campaign:
 *
 *   · FIVE, because one or two recipients with their phones off is ordinary
 *     and five simultaneously is not — and because five is small enough that
 *     a caught failure costs almost nothing.
 *   · FIFTEEN MINUTES, because a delivery receipt for a phone that is on
 *     arrives in seconds, and the grace is sized for a phone that is off, in a
 *     tunnel, or out of credit. It is deliberately far longer than delivery
 *     takes and far shorter than a campaign.
 *
 * It only ever PAUSES. Nothing is marked failed, no recipient is consumed, and
 * «كمّل» resumes exactly where it stopped once the sender is fixed.
 */
const BLIND_SEND_PROBE = 5;
const BLIND_SEND_GRACE_MS = 15 * 60_000;
/**
 * Shown on the campaign screen. Arabic, and specific about what to check:
 * an operator who reads «اتوقفت» with no reason presses resume.
 */
const BLIND_SEND_REASON =
  'اتوقفت لوحدها: أول رسايل اتبعتت وواتساب استلمها بس ماوصلتش لحد أصلاً. اتأكد إن الجهاز مربوط صح قبل ما تكمّل.';

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

    // Before spending another recipient, check the ones already spent. See
    // `BLIND_SEND_PROBE` — this is the only thing standing between a broken
    // sender and a whole audience burned proving it.
    if (await this.sendingBlind(campaign.id, now)) {
      await this.prisma.marketingCampaign.update({
        where: { id: campaign.id },
        data: { status: 'paused', nextSendAt: null, pausedReason: BLIND_SEND_REASON },
      });
      this.logger.error(
        { campaign: campaign.id, probe: BLIND_SEND_PROBE },
        'campaign paused — messages are being accepted by WhatsApp and delivered to nobody',
      );
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

    let sendResult: SendResult;
    try {
      sendResult = await this.device.send({
        phone: recipient.phone,
        text,
        imageUrl: image ? this.mediaUrl.resolve(image.storageKey) : null,
      });
    } catch (error) {
      await this.failed(campaign, recipient.id, recipient.attempts, error, now, state);
      return;
    }

    // ⚠️ `sent` IS NOT DELIVERED, and the id is what lets us find out.
    //
    // This returning without throwing means `sock.sendMessage()` resolved —
    // WhatsApp's servers took custody of the stanza. ONE GREY TICK. Whether it
    // reached a device is answered minutes later, out of band, by a receipt
    // arriving at `WhatsappReceiptController`, and the only thing that can
    // match that receipt to this row is the message id.
    //
    // It used to be discarded on this line — `await this.device.send(...)`
    // with the result unassigned — which is why a campaign WhatsApp accepted
    // in full and delivered to nobody was indistinguishable from a perfect
    // one on every screen the platform has.
    await this.settle(recipient.id, {
      status: 'sent',
      sentAt: now,
      messageId: sendResult.messageId,
    });

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
   * Has everything sent so far vanished?
   *
   * True when the first `BLIND_SEND_PROBE` messages of this campaign have all
   * been `sent` for longer than the grace period and NOT ONE of them was ever
   * acknowledged by a device. That is not a recipient with their phone off —
   * it is the sender failing in the one way it fails silently.
   *
   * Three deliberate properties:
   *
   *   · **The oldest rows, not the newest.** `position` order, so the probe is
   *     a fixed set that either resolves or does not. Sampling the most recent
   *     sends would re-arm the grace period with every message and a campaign
   *     could run forever without ever completing the check.
   *   · **Fewer than the probe count is not a verdict.** A campaign three
   *     messages in has not yet produced enough evidence to stop on, and
   *     `< BLIND_SEND_PROBE` returning false is what makes the first few sends
   *     the experiment rather than the casualty.
   *   · **One delivery clears it, permanently.** The check asks whether ANY of
   *     the probe was delivered. If sending works at all, this never fires
   *     again for this campaign — a student who blocks the number later cannot
   *     accumulate into a false pause.
   *
   * A row sent before the receipt listener shipped has no `deliveredAt` and
   * never will, which would read here as a blind send. That is why the window
   * is bounded by `sentAt` recency as well: rows older than the grace are
   * eligible, but a campaign whose probe predates the deploy is one nobody
   * should resume blind anyway — it stops, says why, and a human looks.
   */
  private async sendingBlind(campaignId: string, now: Date): Promise<boolean> {
    const probe = await this.prisma.marketingRecipient.findMany({
      where: { campaignId, status: 'sent' },
      orderBy: { position: 'asc' },
      take: BLIND_SEND_PROBE,
      select: { sentAt: true, deliveredAt: true },
    });

    if (probe.length < BLIND_SEND_PROBE) return false;
    // One arrival is proof the sender works. Nothing else matters.
    if (probe.some((row) => row.deliveredAt !== null)) return false;

    const deadline = new Date(now.getTime() - BLIND_SEND_GRACE_MS);
    return probe.every((row) => row.sentAt !== null && row.sentAt <= deadline);
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
        data: {
          status: 'paused',
          nextSendAt: null,
          pausedReason: `اتوقفت لوحدها: جهاز الواتساب مش متوصّل (${device.state}). اربطه تاني وكمّل.`,
        },
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
    data: { status: 'sent' | 'skipped'; sentAt?: Date; error?: string; messageId?: string | null },
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
