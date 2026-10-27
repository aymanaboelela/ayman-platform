import { Injectable } from '@nestjs/common';
import type { AutoKindStats, AutoOutreachOverview } from '@ayman/contracts/outreach/auto';
import { composeOutreach, type OutreachFacts } from '@ayman/contracts/outreach/compose';
import { AUTO_WHATSAPP_KINDS } from '@ayman/contracts/outreach/kinds';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappDeviceService } from '../marketing/whatsapp-device.service';
import { OUTREACH_INSTRUCTOR_NAME, OutreachService } from '../outreach/outreach.service';
import { AutoOutreachCandidates } from './auto-outreach-candidates.service';
import {
  CHECKOUT_CONVERSION_MS,
  DAY_MS,
  SIGNUP_CONVERSION_MS,
  cairoDayStart,
  inSendingWindow,
  intentIdOfDedupeKey,
} from './auto-outreach.rules';

/**
 * The read side of «رسايل الواتساب التلقائية» — is it running, and is it
 * earning its place.
 *
 * ## What «رجعت» counts, and what it does not
 *
 * A checkout reminder is credited with a purchase of THE SAME TARGET by the
 * same student within 72 hours of it; a signup nudge with ANY course claim
 * within seven days. Correlation, not proof — someone who would have paid
 * anyway is counted too — and the screen says «دفعوا خلال ٣ أيام», never
 * «بسبب الرسالة».
 *
 * `converted` counts a claim that is pending OR approved: a transfer sitting
 * in the review queue is a student who came back and paid. `revenueCents`
 * counts approved, non-free claims only, at their recorded `amountCents` —
 * money that was actually accepted. A wallet-funded purchase is included at
 * its sale value: the reminder recovered the SALE, even though the cash was
 * booked when the wallet was topped up (`subscription-cash.ts` is the place
 * that must not double-count, and this screen is not a finance total).
 * A book is credited with its `itemsCents` once paid — never the shipping fee,
 * the same rule `BOOK_REVENUE_WHERE` follows.
 */

const WINDOW_MS = 30 * DAY_MS;

@Injectable()
export class AutoOutreachOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outreach: OutreachService,
    private readonly device: WhatsappDeviceService,
    private readonly candidates: AutoOutreachCandidates,
  ) {}

  async overview(now = new Date()): Promise<AutoOutreachOverview> {
    const since = new Date(now.getTime() - WINDOW_MS);
    const context = await this.outreach.context();
    const { settings } = context;

    const [device, sentToday, checkout, signup, dueCheckout, dueSignup] = await Promise.all([
      this.device.status(),
      this.prisma.outreachMessage.count({
        where: {
          kind: { in: [...AUTO_WHATSAPP_KINDS] },
          whatsappStatus: 'sent',
          createdAt: { gte: cairoDayStart(now) },
        },
      }),
      this.checkoutStats(since),
      this.signupStats(since),
      settings.checkoutRecovery ? this.candidates.checkoutDue(now, settings) : Promise.resolve([]),
      settings.signupNudge ? this.candidates.signupDue(now, settings) : Promise.resolve([]),
    ]);

    return {
      device: device.state,
      inWindow: inSendingWindow(now),
      sentToday,
      dailyCap: settings.autoWhatsappDailyCap,
      checkout,
      signup,
      dueNow: { checkout: dueCheckout.length, signup: dueSignup.length },
      samples: this.samples(context.whatsappUrl),
    };
  }

  private async ledger(kind: 'checkout_recovery' | 'signup_nudge', since: Date) {
    return this.prisma.outreachMessage.findMany({
      where: { kind, createdAt: { gte: since } },
      select: {
        userId: true,
        dedupeKey: true,
        createdAt: true,
        whatsappStatus: true,
        whatsappDeliveredAt: true,
      },
    });
  }

  private async checkoutStats(since: Date): Promise<AutoKindStats> {
    const [candidates, messages] = await Promise.all([
      this.prisma.checkoutIntent.count({ where: { openedAt: { gte: since } } }),
      this.ledger('checkout_recovery', since),
    ]);
    const base = ledgerCounts(candidates, messages);
    if (messages.length === 0) return base;

    const intents = await this.prisma.checkoutIntent.findMany({
      where: { id: { in: [...new Set(messages.map((m) => intentIdOfDedupeKey(m.dedupeKey)))] } },
      select: { id: true, target: true, targetId: true },
    });
    const intentById = new Map(intents.map((i) => [i.id, i]));
    const courseIds = intents.filter((i) => i.target === 'course').map((i) => i.targetId);
    const orderIds = intents.filter((i) => i.target === 'book_order').map((i) => i.targetId);

    const [submissions, orders] = await Promise.all([
      courseIds.length === 0
        ? []
        : this.prisma.paymentSubmission.findMany({
            where: {
              userId: { in: [...new Set(messages.map((m) => m.userId))] },
              courseId: { in: courseIds },
              status: { in: ['pending', 'approved'] },
              createdAt: { gte: since },
            },
            select: { userId: true, courseId: true, status: true, createdAt: true, amountCents: true, isFree: true },
          }),
      orderIds.length === 0
        ? []
        : this.prisma.bookOrder.findMany({
            where: { id: { in: orderIds }, paidAt: { not: null }, deletedAt: null },
            select: { id: true, paidAt: true, itemsCents: true, isFree: true, status: true },
          }),
    ]);
    const orderById = new Map(orders.map((o) => [o.id, o]));

    let converted = 0;
    let revenueCents = 0;
    for (const message of messages) {
      const intent = intentById.get(intentIdOfDedupeKey(message.dedupeKey));
      if (!intent) continue;
      const from = message.createdAt.getTime();
      const until = from + CHECKOUT_CONVERSION_MS;
      const inWindow = (at: Date) => at.getTime() >= from && at.getTime() <= until;

      if (intent.target === 'course') {
        const paid = submissions.filter(
          (s) => s.userId === message.userId && s.courseId === intent.targetId && inWindow(s.createdAt),
        );
        if (paid.length === 0) continue;
        converted += 1;
        revenueCents += paid
          .filter((s) => s.status === 'approved' && !s.isFree)
          .reduce((sum, s) => sum + s.amountCents, 0);
      } else {
        const order = orderById.get(intent.targetId);
        if (!order?.paidAt || !inWindow(order.paidAt)) continue;
        converted += 1;
        if (!order.isFree && order.status !== 'rejected') revenueCents += order.itemsCents;
      }
    }
    return { ...base, converted, revenueCents };
  }

  private async signupStats(since: Date): Promise<AutoKindStats> {
    const [candidates, messages] = await Promise.all([
      this.prisma.user.count({ where: { role: 'student', createdAt: { gte: since } } }),
      this.ledger('signup_nudge', since),
    ]);
    const base = ledgerCounts(candidates, messages);
    if (messages.length === 0) return base;

    // Credited to the student's FIRST nudge in the window, so a student who
    // got both and then paid is one conversion, not two.
    const firstNudge = new Map<string, Date>();
    for (const message of messages) {
      const seen = firstNudge.get(message.userId);
      if (!seen || message.createdAt < seen) firstNudge.set(message.userId, message.createdAt);
    }

    const submissions = await this.prisma.paymentSubmission.findMany({
      where: {
        userId: { in: [...firstNudge.keys()] },
        status: { in: ['pending', 'approved'] },
        createdAt: { gte: since },
      },
      select: { userId: true, status: true, createdAt: true, amountCents: true, isFree: true },
    });

    let converted = 0;
    let revenueCents = 0;
    for (const [userId, at] of firstNudge) {
      const from = at.getTime();
      const paid = submissions.filter(
        (s) =>
          s.userId === userId &&
          s.createdAt.getTime() >= from &&
          s.createdAt.getTime() <= from + SIGNUP_CONVERSION_MS,
      );
      if (paid.length === 0) continue;
      converted += 1;
      revenueCents += paid
        .filter((s) => s.status === 'approved' && !s.isFree)
        .reduce((sum, s) => sum + s.amountCents, 0);
    }
    return { ...base, converted, revenueCents };
  }

  /**
   * The real composer on invented facts — the same rule as
   * `OutreachLogService.preview`: a preview that is not the real thing proves
   * nothing. Four samples, one per shape the student can receive.
   */
  private samples(whatsappUrl: string | null): AutoOutreachOverview['samples'] {
    const facts: OutreachFacts[] = [
      {
        kind: 'checkout_recovery',
        target: 'course',
        title: 'البرمجة — الصف الثاني',
        url: 'https://example.invalid/courses/programming-2/subscribe',
      },
      {
        kind: 'checkout_recovery',
        target: 'book_order',
        title: null,
        url: 'https://example.invalid/store/orders/0000/pay',
      },
      {
        kind: 'signup_nudge',
        step: 1,
        courseTitle: 'البرمجة — الصف الثاني',
        url: 'https://example.invalid/courses/programming-2',
      },
      { kind: 'signup_nudge', step: 2, courseTitle: null, url: 'https://example.invalid/courses' },
    ];
    const history: string[] = [];
    return facts.map((sample, index) => {
      const composed = composeOutreach({
        firstName: 'محمد',
        instructorName: OUTREACH_INSTRUCTOR_NAME,
        facts: sample,
        recentVariantKeys: [...history],
        whatsappUrl,
        seed: `auto-preview:${index}`,
      });
      history.unshift(composed.variantKey);
      return { kind: sample.kind as AutoOutreachOverview['samples'][number]['kind'], body: composed.body };
    });
  }
}

function ledgerCounts(
  candidates: number,
  messages: readonly { whatsappStatus: string | null; whatsappDeliveredAt: Date | null }[],
): AutoKindStats {
  return {
    candidates,
    sent: messages.length,
    sentWhatsapp: messages.filter((m) => m.whatsappStatus === 'sent').length,
    delivered: messages.filter((m) => m.whatsappDeliveredAt !== null).length,
    converted: 0,
    revenueCents: 0,
  };
}
