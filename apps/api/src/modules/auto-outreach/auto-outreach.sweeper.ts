import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type Redis from 'ioredis';
import { normalizeEgyptianPhone } from '@ayman/contracts/phone';
import { AUTO_WHATSAPP_KINDS } from '@ayman/contracts/outreach/kinds';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { isFeatureEnabled } from '../../common/entitlements';
import {
  DeviceCeilingError,
  NotOnWhatsAppError,
  WhatsappDeviceService,
  WhatsappRestrictedError,
} from '../marketing/whatsapp-device.service';
import {
  OutreachService,
  type WhatsappLeg,
  type WhatsappRelay,
} from '../outreach/outreach.service';
import { AutoOutreachCandidates, type DueMessage } from './auto-outreach-candidates.service';
import { cairoDayStart, sendGate } from './auto-outreach.rules';

/**
 * «كمّل الدفع» and «الحساب جاهز» — the two messages that go out over WhatsApp
 * with nobody pressing anything.
 *
 * ## At most ONE WhatsApp message per tick, and why
 *
 * These go out from the instructor's personal number, the same one the
 * campaign engine paces with such care (`marketing/pacing.ts`), and — this
 * week — a freshly linked one, which is exactly the kind WhatsApp restricts
 * fastest. So the brakes are all here, in order, and each one stops the tick
 * without writing anything:
 *
 *   1. the stack holds `outreach.whatsapp` AND `marketing.whatsapp`;
 *   2. the device says `connected` — while it does not, NOTHING is sent and
 *      NOTHING is marked sent, so nothing is used up: the morning it is
 *      linked, whatever is still inside its window goes out by itself;
 *   3. 10:00–22:00 Cairo, the campaign window;
 *   4. under TWO daily ceilings: this feature's own (`autoWhatsappDailyCap`,
 *      counted from `outreach_messages`), and the NUMBER's, shared with
 *      campaigns and shipping notices and warmed up for a new number
 *      (`WhatsappDeviceService.assertWithinCeiling`, `device-ceiling.ts`) —
 *      both counted from ledgers, so a restart cannot reset either;
 *   5. a 90s–4m gap since the last one (`gapAfter`), derived from the ledger
 *      too, so the traffic has no beat and a deploy cannot zero it.
 *
 * With a one-minute tick that is at most ~25 an hour, and the ceiling stops
 * the day long before that matters.
 *
 * ## The campaign runner's lock, not one of our own
 *
 * There is one phone. The runner holds `ayman:marketing:runner` in Redis for
 * the length of each send; taking the SAME key here means a campaign message
 * and a reminder can never be on the socket at the same instant, and a busy
 * campaign tick simply makes this one wait a minute. Same fail-closed shape: a
 * Redis error skips the tick.
 *
 * ## Opt-outs, numbers that are not on WhatsApp, students with no phone
 *
 * The reminder still lands in the platform chat — that channel was never the
 * one they said «قف» to — and the ledger row says why WhatsApp was skipped.
 * None of the three spends the daily ceiling, so the tick moves on to the
 * next candidate (a few per tick at most).
 */

const LOCK_KEY = 'ayman:marketing:runner';
const LOCK_TTL_MS = 90_000;
/** Chat-only deliveries a single tick may make while looking for a sendable one. */
const MAX_ATTEMPTS_PER_TICK = 5;

@Injectable()
export class AutoOutreachSweeper {
  private readonly logger = new Logger(AutoOutreachSweeper.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outreach: OutreachService,
    private readonly device: WhatsappDeviceService,
    private readonly candidates: AutoOutreachCandidates,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (!isFeatureEnabled('outreach.whatsapp') || !isFeatureEnabled('marketing.whatsapp')) return;
    // Cheapest check first: in local development and CI there is no sender
    // at all, and this returns before a single query.
    if (!this.device.enabled) return;

    let held = false;
    try {
      held = (await this.redis.set(LOCK_KEY, 'auto-outreach', 'PX', LOCK_TTL_MS, 'NX')) === 'OK';
    } catch (error) {
      this.logger.warn({ err: error }, 'auto outreach could not take the sender lock');
      return;
    }
    if (!held) return;

    try {
      await this.step(new Date());
    } catch (error) {
      this.logger.error({ err: error }, 'auto outreach tick failed');
    } finally {
      await this.redis.del(LOCK_KEY).catch(() => undefined);
    }
  }

  /** One tick. Public for the spec; production reaches it only through `tick`. */
  async step(now: Date): Promise<'sent' | 'idle' | 'blocked'> {
    const context = await this.outreach.context();
    const { settings } = context;
    if (!settings.checkoutRecovery && !settings.signupNudge) return 'idle';

    const device = await this.device.status();
    if (device.state !== 'connected') return 'blocked';

    const [sentToday, last] = await Promise.all([
      this.prisma.outreachMessage.count({
        where: {
          kind: { in: [...AUTO_WHATSAPP_KINDS] },
          whatsappStatus: 'sent',
          createdAt: { gte: cairoDayStart(now) },
        },
      }),
      this.prisma.outreachMessage.findFirst({
        where: { kind: { in: [...AUTO_WHATSAPP_KINDS] }, whatsappStatus: 'sent' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true, createdAt: true },
      }),
    ]);
    const gate = sendGate({
      now,
      sentToday,
      dailyCap: settings.autoWhatsappDailyCap,
      last: last ? { id: last.id, at: last.createdAt } : null,
    });
    if (!gate.open) return 'blocked';

    // The number's own ceiling, asked BEFORE the scan rather than discovered
    // at the send: `send()` would refuse anyway, but only after the chat copy
    // had been composed for a student who then gets nothing.
    try {
      await this.device.assertWithinCeiling(now);
    } catch (error) {
      if (error instanceof DeviceCeilingError) return 'blocked';
      throw error;
    }

    /*
     * Checkout reminders first. A student mid-payment is the most time-bound
     * message the platform has, and the money it recovers is the reason this
     * feature exists; a welcome note can wait a minute.
     */
    const queue: DueMessage[] = [
      ...(settings.checkoutRecovery ? await this.candidates.checkoutDue(now, settings) : []),
      ...(settings.signupNudge ? await this.candidates.signupDue(now, settings) : []),
    ];

    // Counts only deliveries that WROTE something chat-only. A `capped` or
    // `duplicate` costs two reads and must not use up the tick, or five
    // students at their daily cap at the head of the queue would stall
    // everyone behind them until tomorrow.
    let chatOnly = 0;
    for (const item of queue) {
      if (chatOnly >= MAX_ATTEMPTS_PER_TICK) break;

      let leg: WhatsappLeg | null = null;
      const relay: WhatsappRelay = async (body) => {
        leg = await this.relay(item.input.userId, body);
        return leg;
      };

      let outcome;
      try {
        outcome = await this.outreach.deliver(item.input, context, relay);
      } catch (error) {
        /*
         * The sidecar refused or timed out — a fault of SENDING, not of this
         * student. Stop the tick with nothing written; the same student is
         * first in line next minute, and a device that has really gone away
         * will say so on the next `status()`.
         */
        /*
         * Including the two the device service raises itself: the number's
         * ceiling (`DeviceCeilingError`) and WhatsApp refusing new chats right
         * now (`WhatsappRestrictedError` — sending into that deepens the
         * restriction, nack 463). Both are "not now", never "not this
         * student", which is exactly what returning with nothing written means.
         */
        const restricted = error instanceof WhatsappRestrictedError || error instanceof DeviceCeilingError;
        this.logger.warn(
          { err: error, kind: item.input.kind },
          restricted ? 'auto outreach held — the number is not sending new chats now' : 'auto outreach send failed — retrying next tick',
        );
        return 'blocked';
      }

      if (outcome === 'duplicate' && item.intentId) {
        // Already written about (a pass that died between the ledger insert
        // and this stamp). Stamp it now so it leaves the scan.
        await this.prisma.checkoutIntent.update({ where: { id: item.intentId }, data: { remindedAt: now } });
      }
      if (outcome !== 'sent') continue;

      if (item.intentId) {
        await this.prisma.checkoutIntent.update({
          where: { id: item.intentId },
          data: { remindedAt: now },
        });
      }
      // `leg` is assigned inside the relay, which TypeScript cannot see.
      const sentLeg = leg as WhatsappLeg | null;
      if (sentLeg?.status === 'sent') {
        this.logger.log({ kind: item.input.kind }, 'auto outreach sent');
        return 'sent';
      }
      chatOnly += 1;
    }
    return 'idle';
  }

  /** The WhatsApp half of one message. Throws only for a sending fault. */
  private async relay(userId: string, body: string): Promise<WhatsappLeg> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phoneNumber: true },
    });
    const phone = normalizeEgyptianPhone(user?.phoneNumber ?? '');
    if (!phone) return { status: 'no_phone' };

    // Re-read per message, exactly as the campaign runner does: a «قف» that
    // arrived a minute ago has to hold.
    const optedOut = await this.prisma.marketingOptOut.findUnique({
      where: { phone },
      select: { phone: true },
    });
    if (optedOut) return { status: 'opted_out' };

    try {
      // `source: 'outreach'` puts it on the number-wide `whatsapp_sends`
      // ledger under its own name, inside the same ceiling as everything else.
      const result = await this.device.send({ phone, text: body, source: 'outreach' });
      return { status: 'sent', messageId: result.messageId };
    } catch (error) {
      if (error instanceof NotOnWhatsAppError) return { status: 'not_on_whatsapp' };
      throw error;
    }
  }
}
