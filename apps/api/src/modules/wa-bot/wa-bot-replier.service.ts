import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { AskTurn } from '@ayman/contracts/assistant/ask';
import { BOT_INTENTS } from '@ayman/contracts/wa-bot/intents';
import { PrismaService } from '../../prisma/prisma.service';
import { isFeatureEnabled } from '../../common/entitlements';
import { WhatsappDeviceService } from '../marketing/whatsapp-device.service';
import { cairoClock, decide, repliesToday, type Decision } from './policy';
import { WaBotBrainService, type BrainResult } from './wa-bot-brain.service';
import { WaBotIdentityService } from './wa-bot-identity.service';
import { WaBotService } from './wa-bot.service';
import { WaBotSettingsService } from './wa-bot-settings.service';
import type { WaChat } from '../../generated/prisma/client';

/** Chats looked at per pass — a pass must finish well inside the five seconds. */
const BATCH = 4;
/** Lines of history handed to the model. */
const HISTORY = 8;

/**
 * The bot's one loop: every five seconds, the chats whose `replyDueAt` has
 * passed are claimed, checked against the safety rules (`policy.ts`), read
 * (`WaBotBrainService`), and answered through the linked device.
 *
 * ## Claiming is the lock
 *
 * A chat is claimed by clearing its `replyDueAt` with the value just read in
 * the WHERE clause. If anything else touched it in between — a newer message
 * pushing the due time out, a person replying and clearing it — the update
 * matches nothing and this pass leaves it alone. One API process per stack is
 * the norm, but this keeps two from ever answering the same message twice.
 *
 * ## Sends queue behind campaigns, on purpose
 *
 * The sidecar sends one message at a time and types for a moment before each
 * (`services/wa` `send()`), so a reply never bursts out beside a running
 * campaign. A reply that has to wait a few seconds behind one is fine.
 */
@Injectable()
export class WaBotReplier {
  private readonly logger = new Logger(WaBotReplier.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly brain: WaBotBrainService,
    private readonly settings: WaBotSettingsService,
    private readonly identity: WaBotIdentityService,
    private readonly chats: WaBotService,
    private readonly device: WhatsappDeviceService,
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async tick(now = new Date()): Promise<void> {
    if (this.running || !isFeatureEnabled('whatsapp.bot')) return;
    this.running = true;
    try {
      const due = await this.prisma.waChat.findMany({
        where: { replyDueAt: { lte: now } },
        orderBy: [{ replyDueAt: 'asc' }, { id: 'asc' }],
        take: BATCH,
      });
      for (const chat of due) {
        try {
          await this.handle(chat, now);
        } catch (error) {
          this.logger.error(`wa-bot reply failed for a chat: ${error instanceof Error ? error.message : 'unknown'}`);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async handle(chat: WaChat, now: Date): Promise<void> {
    const claimed = await this.prisma.waChat.updateMany({
      where: { id: chat.id, replyDueAt: chat.replyDueAt },
      data: { replyDueAt: null },
    });
    if (claimed.count !== 1) return;

    const waiting = await this.prisma.waChatMessage.findMany({
      where: { chatId: chat.id, author: 'contact', handled: false },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (waiting.length === 0) return;

    const [settings, sentToday, optedOut] = await Promise.all([
      this.settings.settings(),
      this.prisma.waChatMessage.count({
        where: { author: 'bot', status: 'sent', createdAt: { gte: cairoDayStart(now) } },
      }),
      this.chats.optedOut([chat.phone], [chat]),
    ]);

    const decision: Decision = decide({
      now,
      featureOn: isFeatureEnabled('whatsapp.bot') && isFeatureEnabled('marketing.whatsapp') && this.device.enabled,
      settings,
      chat: {
        botPaused: chat.botPaused,
        optedOut: optedOut.has(chat.phone),
        mutedUntil: chat.mutedUntil,
        humanRepliedAt: chat.humanRepliedAt,
        lastBotReplyAt: chat.lastBotReplyAt,
        botRepliesDay: chat.botRepliesDay,
        botRepliesToday: chat.botRepliesToday,
      },
      sentToday,
    });

    if (decision.kind === 'defer') {
      await this.prisma.waChat.updateMany({
        where: { id: chat.id, replyDueAt: null },
        data: { replyDueAt: decision.until },
      });
      return;
    }
    const ids = waiting.map((m) => m.id);
    if (decision.kind === 'skip') {
      await this.prisma.waChatMessage.updateMany({ where: { id: { in: ids } }, data: { handled: true } });
      // A question the bot was not allowed to answer is still a question: it
      // goes to the inbox, unless a person is already on it or it was «قف».
      if (['chatCap', 'dailyCap', 'paused', 'disabled'].includes(decision.reason)) {
        await this.prisma.waChat.update({ where: { id: chat.id }, data: { needsHuman: true } });
      }
      return;
    }

    const who = await this.identity.identify(chat.phone);
    const history = await this.history(chat.id, ids);
    const result = await this.brain.compose({
      text: waiting.map((m) => m.body).join('\n'),
      identity: who,
      chat: {
        awaitingYear: chat.awaitingYear,
        pendingIntents: chat.pendingIntents,
        yearSystem: chat.yearSystem,
        year: chat.year,
        yearAsks: chat.yearAsks,
        lastHandoffNoticeAt: chat.lastHandoffNoticeAt,
        repliedBefore: chat.lastBotReplyAt !== null,
      },
      history,
      settings,
      now,
    });

    await this.prisma.waChatMessage.updateMany({
      where: { id: { in: ids } },
      data: { handled: true, intents: [...result.intents] },
    });

    let sent: { messageId: string | null } | null = null;
    if (result.reply) {
      try {
        sent = await this.device.send({ phone: chat.phone, text: result.reply });
      } catch (error) {
        this.logger.warn(`wa-bot send failed: ${error instanceof Error ? error.message : 'unknown'}`);
      }
      await this.prisma.waChatMessage.create({
        data: {
          chatId: chat.id,
          author: 'bot',
          body: result.reply.slice(0, 4000),
          intents: [...result.intents],
          status: sent ? 'sent' : 'failed',
          waMessageId: sent?.messageId ?? null,
        },
      });
    }

    await this.prisma.waChat.update({
      where: { id: chat.id },
      data: this.chatUpdate(chat, result, sent !== null, now),
    });
  }

  private chatUpdate(chat: WaChat, result: BrainResult, sent: boolean, now: Date) {
    const { patch } = result;
    const builtIn = result.intents.filter((key) => (BOT_INTENTS as readonly string[]).includes(key));
    const intents = [...new Set([...chat.intents, ...builtIn])];
    const today = cairoClock(now).day;
    return {
      intents,
      ...(patch.awaitingYear !== undefined ? { awaitingYear: patch.awaitingYear } : {}),
      ...(patch.pendingIntents !== undefined ? { pendingIntents: [...patch.pendingIntents] } : {}),
      ...(patch.yearAsks !== undefined ? { yearAsks: patch.yearAsks } : {}),
      ...(patch.year ? { yearSystem: patch.year.system, year: patch.year.year, yearLabel: patch.year.label } : {}),
      // A failed send is not a handoff that was announced — but it IS a
      // question nobody answered, so it goes to the inbox either way.
      ...(patch.needsHuman || (result.reply && !sent) ? { needsHuman: true, handoffAt: now } : {}),
      ...(patch.handoffNotice && sent ? { lastHandoffNoticeAt: now } : {}),
      ...(sent
        ? {
            lastBotReplyAt: now,
            botRepliesDay: today,
            botRepliesToday: repliesToday(chat, now) + 1,
            lastMessageAt: now,
            lastMessageAuthor: 'bot' as const,
          }
        : {}),
    };
  }

  /** The lines before the waiting ones, as المساعد's turns. */
  private async history(chatId: string, exclude: string[]): Promise<AskTurn[]> {
    const rows = await this.prisma.waChatMessage.findMany({
      where: { chatId, id: { notIn: exclude }, OR: [{ status: null }, { status: 'sent' }] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: HISTORY,
      select: { author: true, body: true },
    });
    return rows
      .reverse()
      .map((row) => ({ role: row.author === 'contact' ? ('user' as const) : ('assistant' as const), text: row.body.slice(0, 1500) }));
  }
}

/** Midnight, Cairo time, as an instant — the start of «today» for the daily cap. */
export function cairoDayStart(now: Date): Date {
  const { hour, minute } = cairoClock(now);
  const seconds = now.getUTCSeconds();
  const ms = now.getUTCMilliseconds();
  return new Date(now.getTime() - ((hour * 60 + minute) * 60 + seconds) * 1000 - ms);
}
