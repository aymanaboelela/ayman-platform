import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type Redis from 'ioredis';
import { composeGuardianResult, resultRoute } from '@ayman/contracts/outreach/guardian-result';
import { normalizeEgyptianPhone } from '@ayman/contracts/phone';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { isUniqueViolation } from '../../common/prisma/prisma-errors';
import {
  DeviceCeilingError,
  NotOnWhatsAppError,
  WhatsappDeviceService,
  WhatsappRestrictedError,
} from '../marketing/whatsapp-device.service';
import {
  OUTREACH_INSTRUCTOR_NAME,
  OutreachService,
  type DeliveryContext,
} from '../outreach/outreach.service';
import {
  guardianChannelEnabled,
  scorePercentOf,
  topicsFor,
} from '../outreach/outreach-sweeper.service';
import { gapAfter, inSendingWindow } from './auto-outreach.rules';

/**
 * «نتيجة الامتحان لولي الأمر» — a WhatsApp message to the guardian's number
 * when a paper is graded, while `outreach.quizResultTo` is `guardian` or
 * `both`.
 *
 * ## Default: nothing
 *
 * The setting defaults to `student`, which returns before a single query, and
 * the tick returns earlier still on a stack without `outreach.whatsapp` +
 * `marketing.whatsapp`. Nothing here runs anywhere until an admin flips it.
 *
 * ## The same brakes as `AutoOutreachSweeper`, because it is the same phone
 *
 * Every parent is a NEW chat for the instructor's personal number, which is
 * exactly the traffic WhatsApp restricts fastest. So, in order, each one
 * stopping the tick with nothing written:
 *
 *   1. the device says `connected`;
 *   2. 10:00–22:00 Cairo;
 *   3. a 90s–4m gap since the last guardian message, derived from the ledger
 *      (`gapAfter`), so a restart cannot zero it;
 *   4. the NUMBER's daily ceiling, shared with campaigns and every other sender
 *      (`assertWithinCeiling`);
 *   5. `ayman:marketing:runner` in Redis — the campaign runner's own lock, so
 *      two senders are never on the socket at once. This cron fires on second
 *      30, `AutoOutreachSweeper` on second 0: the same key at the same instant
 *      would let one of them win every minute and starve the other.
 *
 * At most ONE WhatsApp per tick.
 *
 * ## Once per paper
 *
 * `guardian_result_messages.attempt_id` is UNIQUE and the row is CLAIMED
 * before the send — see `GuardianResultMessage`. At most once: a crash
 * between claim and send loses that one message rather than risking two.
 *
 * ## Never at the student's expense
 *
 * A number that is invalid, opted out («قف» to a campaign), or not on WhatsApp
 * is recorded on the ledger and skipped quietly. In `guardian` mode — where
 * the student's own message was held back for the parent — the student's
 * message is then delivered here instead, through the same idempotent
 * `OutreachService.deliver`, so a parent who cannot be reached never means a
 * paper nobody heard about.
 */

const LOCK_KEY = 'ayman:marketing:runner';
const LOCK_TTL_MS = 90_000;

/**
 * Results older than this are not sent to a parent at all. Three days, like
 * the referral notice: the morning a device is relinked after a weekend
 * offline, the weekend's papers go out and nothing older does.
 */
export const GUARDIAN_RESULT_FRESH_MS = 3 * 24 * 60 * 60 * 1000;
/**
 * Before the first guardian message ever, nothing older than the moment the
 * setting was saved (less this) is eligible — so switching it on does not
 * write to every parent about every paper of the past three days.
 */
const COLD_START_WINDOW_MS = 20 * 60 * 1000;
/** Papers one tick looks at. Most become a single send; the rest are skips. */
const SCAN = 20;
/** Skips (no number, opted out, not on WhatsApp) one tick may record. */
const MAX_SKIPS_PER_TICK = 5;

type GuardianSkip = 'no_phone' | 'opted_out' | 'not_on_whatsapp';

@Injectable()
export class GuardianResultSweeper {
  private readonly logger = new Logger(GuardianResultSweeper.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outreach: OutreachService,
    private readonly device: WhatsappDeviceService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Cron('30 * * * * *')
  async tick(): Promise<void> {
    if (!guardianChannelEnabled()) return;
    if (!this.device.enabled) return;

    let held = false;
    try {
      held = (await this.redis.set(LOCK_KEY, 'guardian-results', 'PX', LOCK_TTL_MS, 'NX')) === 'OK';
    } catch (error) {
      this.logger.warn({ err: error }, 'guardian results could not take the sender lock');
      return;
    }
    if (!held) return;

    try {
      await this.step(new Date());
    } catch (error) {
      this.logger.error({ err: error }, 'guardian results tick failed');
    } finally {
      await this.redis.del(LOCK_KEY).catch(() => undefined);
    }
  }

  /** One tick. Public for the spec; production reaches it only through `tick`. */
  async step(now: Date): Promise<'sent' | 'idle' | 'blocked'> {
    const context = await this.outreach.context();
    const { settings } = context;
    if (!settings.quizResult || settings.quizResultTo === 'student') return 'idle';

    const device = await this.device.status();
    if (device.state !== 'connected') return 'blocked';
    if (!inSendingWindow(now)) return 'blocked';

    const last = await this.prisma.guardianResultMessage.findFirst({
      where: { status: 'sent' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, createdAt: true },
    });
    if (last && now.getTime() - last.createdAt.getTime() < gapAfter(last.id)) return 'blocked';

    try {
      await this.device.assertWithinCeiling(now);
    } catch (error) {
      if (error instanceof DeviceCeilingError) return 'blocked';
      throw error;
    }

    const attempts = await this.candidates(now);
    let skips = 0;
    for (const attempt of attempts) {
      if (skips >= MAX_SKIPS_PER_TICK) break;

      const raw = attempt.user.studentProfile?.fatherPhone ?? '';
      const phone = normalizeEgyptianPhone(raw);
      const route = resultRoute({ setting: settings.quizResultTo, guardianChannel: true, guardianPhone: phone });
      if (!route.guardian || !phone) {
        // An unreadable number. `OutreachSweeper` reached the same verdict
        // through the same `resultRoute` and sent the student's own message,
        // so recording it is all that is left — and it keeps it out of the scan.
        await this.record(attempt.id, raw.slice(0, 40), 'no_phone');
        skips += 1;
        continue;
      }

      // Re-read per message, as the campaign runner does: a «قف» that arrived
      // a minute ago has to hold.
      const optedOut = await this.prisma.marketingOptOut.findUnique({ where: { phone }, select: { phone: true } });
      if (optedOut) {
        if (await this.record(attempt.id, phone, 'opted_out')) await this.fallBackToStudent(attempt, context);
        skips += 1;
        continue;
      }

      // The claim. A duplicate is another tick (or replica) that got here
      // first — nothing to do, and not a skip worth counting.
      try {
        await this.prisma.guardianResultMessage.create({
          data: { attemptId: attempt.id, phone, status: 'sending' },
        });
      } catch (error) {
        if (isUniqueViolation(error)) continue;
        throw error;
      }

      const text = composeGuardianResult({
        studentName: attempt.user.name,
        instructorName: OUTREACH_INSTRUCTOR_NAME,
        quizTitle: attempt.quiz.lesson.title,
        scorePercent: scorePercentOf(attempt.scaledScore, attempt.gradeOutOf),
        seed: `guardian:${attempt.id}`,
      });

      try {
        // `source: 'outreach'` puts it on the number-wide `whatsapp_sends`
        // ledger inside the same ceiling as everything else; its delivery
        // receipt lands there, matched by `whatsappMessageId`.
        const result = await this.device.send({ phone, text, source: 'outreach' });
        await this.prisma.guardianResultMessage.update({
          where: { attemptId: attempt.id },
          data: { status: 'sent', whatsappMessageId: result.messageId },
        });
        this.logger.log({ attemptId: attempt.id }, 'guardian result sent');
        return 'sent';
      } catch (error) {
        if (error instanceof NotOnWhatsAppError) {
          await this.prisma.guardianResultMessage.update({
            where: { attemptId: attempt.id },
            data: { status: 'not_on_whatsapp' },
          });
          await this.fallBackToStudent(attempt, context);
          skips += 1;
          continue;
        }
        /*
         * The DEVICE, not this number — dropped, the ceiling, or WhatsApp
         * refusing new chats right now (`WhatsappRestrictedError`; sending
         * into that deepens it). Hand the claim back and stop: the same paper
         * is first in line on the next tick that finds the device willing.
         */
        await this.prisma.guardianResultMessage.deleteMany({
          where: { attemptId: attempt.id, status: 'sending' },
        });
        const restricted = error instanceof WhatsappRestrictedError || error instanceof DeviceCeilingError;
        this.logger.warn(
          { err: error, attemptId: attempt.id },
          restricted ? 'guardian result held — the number is not sending new chats now' : 'guardian result send failed — retrying next tick',
        );
        return 'blocked';
      }
    }
    return 'idle';
  }

  /**
   * Graded papers no guardian message has been written about, oldest first,
   * whose student has a guardian number on file at all (a profile with none
   * is the student-only case and never enters the scan).
   */
  private async candidates(now: Date) {
    const floor = await this.floor(now);
    const fresh = new Date(now.getTime() - GUARDIAN_RESULT_FRESH_MS);
    return this.prisma.quizAttempt.findMany({
      where: {
        // `submitted` only, never `pending_review` — the same rule as the
        // student's message: an essay still unmarked means no final score.
        state: 'submitted',
        submittedAt: { gte: fresh > floor ? fresh : floor },
        guardianResult: { is: null },
        user: { bannedAt: null, studentProfile: { is: { fatherPhone: { not: null } } } },
      },
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      take: SCAN,
      select: {
        id: true,
        userId: true,
        scaledScore: true,
        gradeOutOf: true,
        quiz: { select: { lesson: { select: { title: true } } } },
        user: { select: { name: true, studentProfile: { select: { fatherPhone: true } } } },
        // Only for the student fallback, which needs the full facts.
        questions: {
          orderBy: { slotPosition: 'asc' },
          select: {
            slotPosition: true,
            state: true,
            version: { select: { bankEntry: { select: { category: { select: { name: true } } } } } },
          },
        },
      },
    });
  }

  /**
   * The earliest paper a guardian may hear about — `OutreachSweeper
   * .activationFloor`'s rule, anchored on this ledger. Before its first row,
   * the anchor is when the settings were last saved: that save is the one
   * that switched this on, so papers sat after it (even overnight, outside
   * the sending window) still go out in the morning, and nothing from before
   * it does.
   */
  private async floor(now: Date): Promise<Date> {
    const first = await this.prisma.guardianResultMessage.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    let anchor = first?.createdAt;
    if (!anchor) {
      const row = await this.prisma.siteSetting.findUnique({ where: { id: 1 }, select: { updatedAt: true } });
      anchor = row?.updatedAt ?? now;
    }
    return new Date(anchor.getTime() - COLD_START_WINDOW_MS);
  }

  /** A ledger row for a paper that will not be sent. `false` if one existed. */
  private async record(attemptId: string, phone: string, status: GuardianSkip): Promise<boolean> {
    try {
      await this.prisma.guardianResultMessage.create({ data: { attemptId, phone, status } });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  /**
   * `guardian` mode held the student's own message back for a parent who
   * turned out to be unreachable. Deliver it now — same kind, same dedupe key
   * (the attempt id) as `OutreachSweeper.sendResults`, so this can never be a
   * second copy. Its failure is logged and never stops the tick.
   */
  private async fallBackToStudent(
    attempt: Awaited<ReturnType<GuardianResultSweeper['candidates']>>[number],
    context: DeliveryContext,
  ): Promise<void> {
    if (context.settings.quizResultTo !== 'guardian') return;
    try {
      await this.outreach.deliver(
        {
          userId: attempt.userId,
          kind: 'quiz_result',
          dedupeKey: attempt.id,
          facts: {
            kind: 'quiz_result',
            quizTitle: attempt.quiz.lesson.title,
            scorePercent: scorePercentOf(attempt.scaledScore, attempt.gradeOutOf),
            ...topicsFor(attempt.questions),
          },
        },
        context,
      );
    } catch (error) {
      this.logger.error({ err: error, attemptId: attempt.id }, 'guardian result: student fallback failed');
    }
  }
}
