import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { composeOutreach, firstNameOf } from '@ayman/contracts/outreach/compose';
import { normalizeEgyptianPhone } from '@ayman/contracts/phone';
import { isFeatureEnabled } from '../../common/entitlements';
import { PrismaService } from '../../prisma/prisma.service';
import { NotOnWhatsAppError, WhatsappDeviceService } from '../marketing/whatsapp-device.service';
import { OUTREACH_INSTRUCTOR_NAME } from '../outreach/outreach.service';
import { readReferralProgram } from './referral-attribution';

/**
 * Only rewards credited this recently are announced. This is what makes
 * linking a device safe: the first tick after a new number is paired finds
 * the last three days' rewards and nothing older — never a burst of every
 * reward since the program started, to people who stopped expecting one.
 */
export const NOTICE_FRESH_MS = 3 * 24 * 60 * 60 * 1000;
/** Per tick. A trickle from a personal number, not a campaign. */
const NOTICE_BATCH = 10;
/** Between two sends, so a batch never reads as a burst to WhatsApp. */
const NOTICE_GAP_MS = 4000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * «مكافأة الدعوة نزلت» — a WhatsApp message to the student whose link brought
 * a paying friend, from the instructor's own linked device.
 *
 * ## The wallet credit never waits on this
 *
 * The reward is committed by `ReferralsService.reward()` long before this
 * runs, and nothing here can undo or delay it. This is a courtesy on top of a
 * fact that already happened — the student also has the in-app notification,
 * written in the same transaction as the money.
 *
 * ## No device, no send, no mark
 *
 * The whole pass is skipped unless the sidecar says `connected`. Nothing is
 * claimed, nothing is marked, so the moment a number is linked the fresh
 * rewards (`NOTICE_FRESH_MS`) go out — and only those.
 *
 * ## Once per referral
 *
 * `notice_at` is CLAIMED with a conditional UPDATE before the send. A crash
 * between the claim and the send leaves a row marked `sending` that is never
 * retried: at most once, because a duplicate «نزلتلك مكافأة» is worse than a
 * missing one. A send that fails for a reason that is not about the number
 * (the device dropped mid-batch) RELEASES the claim and ends the pass, so the
 * row is tried again on the next tick that finds the device up.
 *
 * Opt-outs are the marketing list's (`marketing_opt_outs`): somebody who
 * replied «قف» to a campaign is not messaged by this either.
 */
@Injectable()
export class ReferralNoticeService {
  private readonly logger = new Logger(ReferralNoticeService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly device: WhatsappDeviceService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async tick(now: Date = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      return await this.pass(now);
    } finally {
      this.running = false;
    }
  }

  private async pass(now: Date): Promise<number> {
    if (!isFeatureEnabled('referrals')) return 0;
    const program = await readReferralProgram(this.prisma);
    if (!program.whatsappNotice) return 0;
    if (!this.device.enabled) return 0;
    const state = await this.device.status();
    if (state.state !== 'connected') return 0;

    const due = await this.prisma.referral.findMany({
      where: {
        status: 'credited',
        noticeAt: null,
        referrerRewardCents: { gt: 0 },
        creditedAt: { gte: new Date(now.getTime() - NOTICE_FRESH_MS) },
      },
      orderBy: [{ creditedAt: 'asc' }, { id: 'asc' }],
      take: NOTICE_BATCH,
      select: {
        id: true,
        referrerRewardCents: true,
        referrer: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            bannedAt: true,
            studentProfile: { select: { phone: true } },
          },
        },
      },
    });

    let sent = 0;
    for (const [index, row] of due.entries()) {
      const claimed = await this.prisma.referral.updateMany({
        where: { id: row.id, noticeAt: null },
        data: { noticeAt: now, noticeOutcome: 'sending' },
      });
      if (claimed.count === 0) continue;

      // The account's number first; an email-only account still has the
      // profile's — the number they typed at onboarding.
      const raw = row.referrer.phoneNumber ?? row.referrer.studentProfile?.phone ?? null;
      const phone = raw ? normalizeEgyptianPhone(raw) : null;
      if (!phone || row.referrer.bannedAt) {
        await this.settle(row.id, 'no_phone');
        continue;
      }
      const optedOut = await this.prisma.marketingOptOut.findUnique({ where: { phone }, select: { phone: true } });
      if (optedOut) {
        await this.settle(row.id, 'opted_out');
        continue;
      }

      const text = composeOutreach({
        firstName: firstNameOf(row.referrer.name),
        instructorName: OUTREACH_INSTRUCTOR_NAME,
        facts: { kind: 'referral_reward', amount: String(Math.round((row.referrerRewardCents ?? 0) / 100)) },
        recentVariantKeys: [],
        whatsappUrl: null,
        seed: `referral:${row.id}`,
      }).body;

      if (index > 0) await sleep(NOTICE_GAP_MS);
      try {
        await this.device.send({ phone, text, imageUrl: null });
        await this.settle(row.id, 'sent');
        sent += 1;
      } catch (error) {
        if (error instanceof NotOnWhatsAppError) {
          await this.settle(row.id, 'not_on_whatsapp');
          continue;
        }
        // The device, not the number. Hand the row back and stop: the next
        // tick that finds the device up tries it again.
        await this.prisma.referral.updateMany({
          where: { id: row.id, noticeOutcome: 'sending' },
          data: { noticeAt: null, noticeOutcome: null },
        });
        this.logger.warn({ err: error, referralId: row.id }, 'referral notice: device refused, will retry');
        break;
      }
    }
    return sent;
  }

  private async settle(id: string, outcome: string): Promise<void> {
    await this.prisma.referral.update({ where: { id }, data: { noticeOutcome: outcome } });
  }
}
