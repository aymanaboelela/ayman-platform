import { Injectable, Logger } from '@nestjs/common';
import type { OutreachSettings } from '@ayman/contracts/admin/settings';
import {
  composeOutreach,
  firstNameOf,
  type OutreachFacts,
} from '@ayman/contracts/outreach/compose';
import type { OutreachKind } from '@ayman/contracts/outreach/kinds';
import { PrismaService } from '../../prisma/prisma.service';
import { isUniqueViolation } from '../../common/prisma/prisma-errors';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../admin/settings/settings.service';
import type { Prisma } from '../../generated/prisma/client';

/**
 * «رسايل م. أيمن» — the one write path for a message sent in the instructor's
 * name.
 *
 * ## An outreach message is a CHAT MESSAGE, not a broadcast
 *
 * It is written as an ordinary `admin` row in an ordinary conversation, so
 * everything the platform already knows how to do with a conversation applies
 * to it for free: the student sees it in the same المساعد panel, the unread dot
 * on the launcher counts it, replying works, and the reply lands in the same
 * inbox the instructor already reads. The alternative — an announcements table
 * with its own screen — would have given the student a message they could not
 * answer, which is the opposite of what this feature is for.
 *
 * ## Why nothing here runs inside the grading transaction
 *
 * The obvious place to send a result message is `gradeAndFinalise`, beside the
 * `quiz_graded` notification. It is the wrong place, for two reasons that both
 * matter more than immediacy:
 *
 *   · a bug in composition would make a student unable to SUBMIT THEIR EXAM.
 *     Nothing about a friendly message is worth putting on that path.
 *   · a message that lands in the same millisecond as the score reads as
 *     machinery. A minute later reads as a person who looked.
 *
 * So delivery is driven by `OutreachSweeper`, and the dedupe index is what
 * makes that safe to run again and again.
 *
 * ## Idempotency is the unique index, not a lookup
 *
 * `deliver` does not ask "have I sent this already". It inserts and lets
 * `outreach_messages_dedupe_key` reject the duplicate, because the SELECT
 * version has a race between two cron ticks and this one does not.
 */

/** How much history the composer is shown. Comfortably past every pool size. */
const HISTORY_DEPTH = 12;

export interface DeliverInput {
  userId: string;
  kind: OutreachKind;
  /** See `OutreachMessage.dedupeKey`. Stable for "this exact message". */
  dedupeKey: string;
  facts: OutreachFacts;
}

export interface DeliveryContext {
  settings: OutreachSettings;
  /** `null` when the admin has set no group link; then none is ever offered. */
  whatsappUrl: string | null;
}

export type DeliveryOutcome = 'sent' | 'duplicate' | 'capped' | 'no-recipient';

@Injectable()
export class OutreachService {
  private readonly logger = new Logger(OutreachService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Reads the settings once per sweep rather than once per student.
   *
   * A sweep that messages forty students would otherwise issue forty identical
   * reads of a single-row table — and, worse, could act on two different
   * configurations within one pass if the admin saved in the middle of it.
   */
  async context(): Promise<DeliveryContext> {
    const site = await this.settings.read();
    /*
     * The CHANNEL, not the group — and this is the field that decides whether
     * the invitation exists at all.
     *
     * It was `whatsappGroup` and the invitation never went out once, because
     * that field has never been set: it is the students' chat group, which is
     * not what the instructor wanted to send anyone to. The CHANNEL is where he
     * uploads the material — summaries, files, revisions, and the notice that
     * any of them went up — and it is the one that has been configured since
     * the platform launched. The copy in `WHATSAPP_BODIES` promises exactly
     * that and nothing a channel cannot do (nobody can reply in one).
     *
     * No fallback to the group. A message that says «بنزّل عليها كل المادة»
     * over a link to a student chat is a promise the destination cannot keep,
     * and the failure would be silent — the same class of bug as the bare
     * `https://wa.me/` the footer once shipped.
     */
    return { settings: site.outreach, whatsappUrl: site.contact.whatsappChannel };
  }

  async deliver(input: DeliverInput, context: DeliveryContext): Promise<DeliveryOutcome> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { name: true, bannedAt: true },
    });
    // A banned student is not someone we are still coaching. Checked here
    // rather than in each sweep so no future caller can forget it.
    if (!user || user.bannedAt) return 'no-recipient';

    if (await this.overDailyCap(input, context.settings)) return 'capped';

    const recent = await this.prisma.outreachMessage.findMany({
      /*
       * ACROSS EVERY KIND, deliberately. The greeting pool is shared, so a
       * history scoped to `quiz_result` would happily open a nudge with the
       * same «إزيك يا محمد 👋» an hour after a result used it — which is
       * exactly the tell this feature exists to avoid.
       */
      where: { userId: input.userId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_DEPTH,
      select: { variantKey: true },
    });

    const composed = composeOutreach({
      firstName: firstNameOf(user.name),
      facts: input.facts,
      recentVariantKeys: recent.map((row) => row.variantKey),
      whatsappUrl: context.whatsappUrl,
      // Stable per message: a retry after a dropped connection composes the
      // identical body rather than a second, differently-worded one.
      seed: `${input.userId}:${input.kind}:${input.dedupeKey}`,
    });

    try {
      await this.prisma.$transaction(async (tx) => {
        const conversationId = await this.threadFor(tx, input.userId);

        const message = await tx.conversationMessage.create({
          data: { conversationId, author: 'admin', body: composed.body },
          select: { id: true },
        });

        await tx.conversation.update({
          where: { id: conversationId },
          data: {
            /*
             * `answered`, the same status `AssistantService.reply` sets: he
             * spoke last, so nothing is waiting on him. A student's reply flips
             * it back to `open` through the ordinary visitor path and it
             * surfaces in the inbox exactly like a cold question — which is the
             * whole reason the origin column exists to tell the two apart.
             */
            status: 'answered',
            lastMessageAt: new Date(),
            /**
             * ⚠️ THE ONE THAT CAUSED IT.
             *
             * `status: 'answered'` above was already saying "he spoke last",
             * and the inbox agreed — until it computed «غير مقروءة» from
             * `lastMessageAt > adminReadAt`, which this line had just made
             * true. So «رسايل للطلبة» — him writing TO a student — landed the
             * thread back on his own unread tab with his own words as the
             * preview, and the sidebar badge counted it. Reported with a
             * screenshot: «هنا بييجي له رسالة واردة، وأصلاً أنا اللي بعتها».
             *
             * The status and the author now say the same thing in the same
             * write, and the inbox reads the author.
             */
            lastMessageAuthor: 'admin',
            // `visitorReadAt` untouched: the student has not read this yet, and
            // that is what lights the dot on the launcher.
          },
        });

        // The ledger insert is what can throw, and it is deliberately LAST:
        // the unique violation rolls the message back with it, so a duplicate
        // sweep leaves no orphaned bubble in the student's chat.
        await tx.outreachMessage.create({
          data: {
            userId: input.userId,
            kind: input.kind,
            dedupeKey: input.dedupeKey,
            variantKey: composed.variantKey,
            // Same cast `NotificationsService.emit` makes for the same reason:
            // a closed object literal is structurally a valid jsonb value but
            // does not carry Prisma's index signature.
            facts: input.facts as unknown as Prisma.InputJsonValue,
            conversationId,
            messageId: message.id,
          },
        });

        await this.notifications.emit(tx, {
          userId: input.userId,
          kind: 'instructor_message',
          conversationId,
          outreachKind: input.kind,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) return 'duplicate';
      throw error;
    }

    return 'sent';
  }

  /**
   * The ceiling on UNPROMPTED messages per student per day.
   *
   * `quiz_result` is exempt, and that exemption is the point of the rule rather
   * than a hole in it: a student who sits three papers in an evening has earned
   * three replies, and suppressing the third would make the feature look broken
   * precisely for the student using the platform hardest. What the cap exists
   * to stop is the other direction — a sweep finding four finished lessons and
   * sending four unsolicited notes in one hour, which is a mailing list wearing
   * someone's name.
   */
  private async overDailyCap(input: DeliverInput, settings: OutreachSettings): Promise<boolean> {
    if (input.kind === 'quiz_result') return false;

    const since = new Date(Date.now() - DAY_MS);
    const sent = await this.prisma.outreachMessage.count({
      where: { userId: input.userId, createdAt: { gte: since }, kind: { not: 'quiz_result' } },
    });
    return sent >= settings.maxPerStudentPerDay;
  }

  /**
   * The student's outreach thread, created on first contact.
   *
   * One thread, reused — because that is what it IS to the student: an ongoing
   * chat with their teacher, not a numbered sequence of notices. A CLOSED one
   * is not reused: he closed it deliberately, and appending to it would give
   * the student a message with no reply box under it.
   */
  private async threadFor(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    userId: string,
  ): Promise<string> {
    const existing = await tx.conversation.findFirst({
      where: { userId, origin: 'outreach', status: { not: 'closed' } },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await tx.conversation.create({
      data: {
        userId,
        origin: 'outreach',
        status: 'answered',
        // No `entryPath`: the student walked no tree to get here. The inbox
        // renders no crumbs for an empty one, which is the honest answer.
        entryPath: [],
      },
      select: { id: true },
    });
    return created.id;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
