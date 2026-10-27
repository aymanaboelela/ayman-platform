import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { isOptOutMessage } from '@ayman/contracts/marketing/render';
import { normalizeEgyptianPhone } from '@ayman/contracts/phone';
import { copy as bot } from '@ayman/contracts/copy/wa-bot';
import { looksAutomated } from '@ayman/contracts/wa-bot/intents';
import { normalizeArabic } from '@ayman/contracts/wa-bot/normalize';
import type {
  LeadList,
  LeadPatch,
  LeadQuery,
  LeadRow,
  LeadStatus,
  WaChatDetail,
  WaChatFilter,
  WaChatPatch,
  WaChatRow,
} from '@ayman/contracts/wa-bot/schemas';
import type { ListResponse } from '@ayman/contracts/admin/list';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { isFeatureEnabled } from '../../common/entitlements';
import { NotOnWhatsAppError, WhatsappDeviceService } from '../marketing/whatsapp-device.service';
import { Prisma, type WaChat } from '../../generated/prisma/client';
import { BURST_LIMIT, BURST_WINDOW_MS, DEBOUNCE_MS, MUTE_MS } from './policy';
import { WaBotFactsService } from './wa-bot-facts.service';
import { WaBotIdentityService, chatPhone } from './wa-bot-identity.service';
import { WaBotSettingsService } from './wa-bot-settings.service';

/** What the sidecar relays for one message. */
export interface InboundMessage {
  readonly phone: string;
  readonly text: string;
  /** WhatsApp's push name — what the sender calls themselves. */
  readonly name?: string | null;
  readonly messageId?: string | null;
  /**
   * Typed on the linked handset itself, not sent through the API. That is a
   * PERSON answering, and it is what keeps the bot quiet in that chat.
   */
  readonly fromMe?: boolean;
}

const PREVIEW = 300;
const MAX_BODY = 1000;

/**
 * The record of every WhatsApp chat on the linked number — what came in, who
 * it is, and what a person did about it. The deciding and the answering live
 * in `WaBotReplier`; this file only ever writes down.
 *
 * ## Inbound is acknowledged fast, answered later
 *
 * The sidecar waits on this call with an eight-second budget and no retry. So
 * an inbound message is recorded and the chat is marked DUE a few seconds
 * out (`replyDueAt`), and nothing slow — no catalog read, no model, no send —
 * happens on this path. The replier picks it up from the table, which is also
 * what lets a burst of three short messages be answered once, and what makes
 * the queue survive a restart.
 */
@Injectable()
export class WaBotService {
  private readonly logger = new Logger(WaBotService.name);
  private sweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: WaBotIdentityService,
    private readonly device: WhatsappDeviceService,
    private readonly settings: WaBotSettingsService,
    private readonly facts: WaBotFactsService,
    private readonly audit: AuditService,
  ) {}

  // ── inbound ────────────────────────────────────────────────────────────

  async recordInbound(input: InboundMessage, now = new Date()): Promise<void> {
    if (!isFeatureEnabled('whatsapp.bot')) return;
    const phone = chatPhone(input.phone);
    const text = input.text.trim().slice(0, MAX_BODY);
    if (!phone || !text) return;

    const messageId = input.messageId?.slice(0, 128) || null;
    if (messageId) {
      const seen = await this.prisma.waChatMessage.findUnique({ where: { waMessageId: messageId }, select: { id: true } });
      if (seen) return;
    }

    try {
      if (input.fromMe) await this.recordHandsetReply(phone, text, messageId, now);
      else await this.recordContactMessage(phone, text, input.name ?? null, messageId, now);
    } catch (error) {
      // The same message relayed twice at the same instant: the unique index
      // on `wa_message_id` is the arbiter, and losing that race is success.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      throw error;
    }
  }

  private async recordContactMessage(
    phone: string,
    text: string,
    pushName: string | null,
    messageId: string | null,
    now: Date,
  ): Promise<void> {
    const who = await this.identity.identify(phone);
    const optOut = isOptOutMessage(text);
    const automated = looksAutomated(text);
    const preview = text.slice(0, PREVIEW);
    const name = pushName?.trim().slice(0, 120) || null;
    const due = optOut || automated ? null : new Date(now.getTime() + DEBOUNCE_MS);

    const chat = await this.prisma.$transaction(async (tx) => {
      const row = await tx.waChat.upsert({
        where: { phone },
        create: {
          phone,
          pushName: name,
          userId: who.userId,
          who: who.who,
          isLead: who.who === 'lead' && !who.staff,
          firstMessage: preview,
          lastMessage: preview,
          firstMessageAt: now,
          lastInboundAt: now,
          lastMessageAt: now,
          messageCount: 1,
          replyDueAt: due,
          optedOutAt: optOut ? now : null,
          mutedUntil: automated ? new Date(now.getTime() + MUTE_MS) : null,
        },
        update: {
          ...(name ? { pushName: name } : {}),
          userId: who.userId,
          who: who.who,
          lastMessage: preview,
          lastInboundAt: now,
          lastMessageAt: now,
          lastMessageAuthor: 'contact',
          messageCount: { increment: 1 },
          replyDueAt: due,
          ...(optOut ? { optedOutAt: now } : {}),
          ...(automated ? { mutedUntil: new Date(now.getTime() + MUTE_MS) } : {}),
        },
      });

      await tx.waChatMessage.create({
        data: { chatId: row.id, author: 'contact', body: text, waMessageId: messageId, handled: due === null },
      });

      // Another bot, or a loop: six messages a minute, or our own last reply
      // sent straight back. Muted for a day — the inbox still shows it all.
      const [recent, lastOut] = await Promise.all([
        tx.waChatMessage.count({
          where: { chatId: row.id, author: 'contact', createdAt: { gte: new Date(now.getTime() - BURST_WINDOW_MS) } },
        }),
        tx.waChatMessage.findFirst({
          where: { chatId: row.id, author: 'bot' },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { body: true },
        }),
      ]);
      const echo = lastOut !== null && normalizeArabic(lastOut.body) === normalizeArabic(text);
      if (recent >= BURST_LIMIT || echo) {
        await tx.waChat.update({
          where: { id: row.id },
          data: { mutedUntil: new Date(now.getTime() + MUTE_MS), replyDueAt: null },
        });
        await tx.waChatMessage.updateMany({ where: { chatId: row.id, handled: false }, data: { handled: true } });
      }
      return row;
    });

    if (chat.isLead && chat.leadStatus !== 'subscribed' && who.who === 'student' && who.userId) {
      await this.convertIfPaid(chat.id, who.userId, now);
    }
  }

  /** Somebody answered from the phone itself. Only into a chat that already exists. */
  private async recordHandsetReply(phone: string, text: string, messageId: string | null, now: Date): Promise<void> {
    const chat = await this.prisma.waChat.findUnique({ where: { phone } });
    if (!chat) return;
    // Belt and braces with the sidecar's own filter: a line identical to what
    // the bot or the inbox sent here a moment ago is that message echoed
    // back, not a person — and reading it as one would silence the bot for
    // hours on the strength of its own reply.
    const echo = await this.prisma.waChatMessage.findFirst({
      where: {
        chatId: chat.id,
        author: { in: ['bot', 'admin'] },
        body: text,
        createdAt: { gte: new Date(now.getTime() - 2 * 60_000) },
      },
      select: { id: true },
    });
    if (echo) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.waChatMessage.create({
        data: { chatId: chat.id, author: 'phone', body: text, waMessageId: messageId, status: 'sent' },
      });
      await this.markHumanReplied(tx, chat, now, 'phone');
    });
  }

  /**
   * A person spoke — from the inbox or the handset. The bot falls silent here
   * for the configured window, the handoff is answered, and anything still
   * waiting for the bot is left to the person.
   */
  private async markHumanReplied(
    tx: Prisma.TransactionClient,
    chat: WaChat,
    now: Date,
    author: 'admin' | 'phone',
  ): Promise<void> {
    await tx.waChat.update({
      where: { id: chat.id },
      data: {
        humanRepliedAt: now,
        needsHuman: false,
        lastMessageAt: now,
        lastMessageAuthor: author,
        replyDueAt: null,
        adminReadAt: now,
        awaitingYear: false,
        pendingIntents: [],
        ...(chat.isLead && chat.leadStatus === 'new' ? { leadStatus: 'contacted' as const } : {}),
      },
    });
    await tx.waChatMessage.updateMany({ where: { chatId: chat.id, handled: false }, data: { handled: true } });
  }

  // ── conversion ─────────────────────────────────────────────────────────

  private async convertIfPaid(chatId: string, userId: string, now: Date): Promise<boolean> {
    if (!(await this.identity.hasPaid(userId))) return false;
    await this.prisma.waChat.update({
      where: { id: chatId },
      data: { leadStatus: 'subscribed', convertedAt: now, userId },
    });
    return true;
  }

  /**
   * «اشترك» on its own: every ten minutes, the recent leads that are not
   * marked subscribed are matched against accounts again, and the ones whose
   * account has an approved, paid subscription are marked.
   *
   * A sweep rather than a hook on payment approval because a payment is
   * approved in four places (the desk, the InstaPay auto-match, the wallet,
   * a bulk action), and a fifth listener in each is four places to forget.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweepConversions(now = new Date()): Promise<number> {
    if (!isFeatureEnabled('whatsapp.bot') || this.sweeping) return 0;
    this.sweeping = true;
    let converted = 0;
    try {
      const leads = await this.prisma.waChat.findMany({
        where: {
          isLead: true,
          leadStatus: { not: 'subscribed' },
          lastMessageAt: { gte: new Date(now.getTime() - 120 * 86_400_000) },
        },
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
        take: 300,
        select: { id: true, phone: true, userId: true },
      });
      for (const lead of leads) {
        const who = await this.identity.identify(lead.phone);
        if (who.who !== 'student' || !who.userId) continue;
        if (await this.convertIfPaid(lead.id, who.userId, now)) converted += 1;
        else if (lead.userId !== who.userId) {
          await this.prisma.waChat.update({ where: { id: lead.id }, data: { userId: who.userId, who: 'student' } });
        }
      }
    } catch (error) {
      this.logger.error(`lead conversion sweep failed: ${error instanceof Error ? error.message : 'unknown'}`);
    } finally {
      this.sweeping = false;
    }
    return converted;
  }

  // ── the inbox ──────────────────────────────────────────────────────────

  async listChats(filter: WaChatFilter, page: number, perPage: number): Promise<ListResponse<WaChatRow>> {
    const where: Prisma.WaChatWhereInput =
      filter === 'handoff'
        ? { needsHuman: true }
        : filter === 'unread'
          ? {
              lastMessageAuthor: 'contact',
              OR: [{ adminReadAt: null }, { adminReadAt: { lt: this.prisma.waChat.fields.lastInboundAt } }],
            }
          : {};
    const [rows, rowCount] = await Promise.all([
      this.prisma.waChat.findMany({
        where,
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          messages: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { body: true, author: true } },
        },
      }),
      this.prisma.waChat.count({ where }),
    ]);
    const optedOut = await this.optedOut(rows.map((r) => r.phone), rows);
    const names = await this.accountNames(rows.map((r) => r.userId));
    return {
      rows: rows.map((row) => this.toRow(row, row.messages[0] ?? null, optedOut, names)),
      rowCount,
    };
  }

  async chatDetail(id: string, now = new Date()): Promise<WaChatDetail> {
    const chat = await this.prisma.waChat.findUnique({ where: { id } });
    if (!chat) throw new NotFoundException();
    const [messages, settings] = await Promise.all([
      this.prisma.waChatMessage.findMany({
        where: { chatId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 200,
      }),
      this.settings.settings(),
    ]);
    await this.prisma.waChat.update({ where: { id }, data: { adminReadAt: now } });
    const optedOut = await this.optedOut([chat.phone], [chat]);
    const names = await this.accountNames([chat.userId]);
    const last = messages[0] ?? null;
    const silentUntil = chat.humanRepliedAt
      ? new Date(chat.humanRepliedAt.getTime() + settings.handoffSilenceHours * 3_600_000)
      : null;
    return {
      ...this.toRow({ ...chat, adminReadAt: now }, last, optedOut, names),
      messages: messages.reverse().map((m) => ({
        id: m.id,
        author: m.author,
        body: m.body,
        intents: m.intents,
        status: m.status,
        createdAt: m.createdAt.toISOString(),
      })),
      leadStatus: chat.isLead ? chat.leadStatus : null,
      yearLabel: chat.yearLabel,
      notes: chat.notes,
      silentUntil: silentUntil && silentUntil > now ? silentUntil.toISOString() : null,
    };
  }

  async reply(id: string, text: string, actorId: string, now = new Date()): Promise<WaChatDetail> {
    const chat = await this.prisma.waChat.findUnique({ where: { id } });
    if (!chat) throw new NotFoundException();

    let messageId: string | null;
    try {
      ({ messageId } = await this.device.send({ phone: chat.phone, text }));
    } catch (error) {
      if (error instanceof NotOnWhatsAppError) throw new BadRequestException(bot.admin.replyFailed);
      this.logger.warn(`wa inbox reply failed: ${error instanceof Error ? error.message : 'unknown'}`);
      throw new ServiceUnavailableException(bot.admin.replyFailed);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.waChatMessage.create({
        data: { chatId: chat.id, author: 'admin', body: text, waMessageId: messageId, status: 'sent' },
      });
      await this.markHumanReplied(tx, chat, now, 'admin');
    });
    await this.audit.record({
      action: 'wa-bot:reply',
      resourceType: 'wa_chat',
      resourceId: chat.id,
      outcome: 'success',
      actorUserId: actorId,
      metadata: { messageId, length: text.length },
    });
    return this.chatDetail(id, now);
  }

  async patchChat(id: string, patch: WaChatPatch): Promise<WaChatDetail> {
    const chat = await this.prisma.waChat.findUnique({ where: { id }, select: { id: true } });
    if (!chat) throw new NotFoundException();
    await this.prisma.waChat.update({
      where: { id },
      data: {
        ...(patch.needsHuman !== undefined ? { needsHuman: patch.needsHuman } : {}),
        ...(patch.botPaused !== undefined ? { botPaused: patch.botPaused } : {}),
      },
    });
    return this.chatDetail(id);
  }

  // ── leads ──────────────────────────────────────────────────────────────

  private leadWhere(query: LeadQuery, withStatus = true): Prisma.WaChatWhereInput {
    const [system, year] = query.year ? query.year.split(':') : [];
    const q = query.q?.trim();
    const digits = q?.replace(/\D/gu, '') ?? '';
    return {
      isLead: true,
      ...(withStatus && query.status ? { leadStatus: query.status } : {}),
      ...(query.intent ? { intents: { has: query.intent } } : {}),
      ...(system && year ? { yearSystem: system, year: Number(year) } : {}),
      ...(q
        ? {
            OR: [
              ...(digits.length >= 3 ? [{ phone: { contains: digits.replace(/^0/u, '') } }] : []),
              { pushName: { contains: q, mode: 'insensitive' as const } },
              { notes: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
  }

  async leads(query: LeadQuery, page: number, perPage: number): Promise<LeadList> {
    const where = this.leadWhere(query);
    const [rows, rowCount, grouped, catalog] = await Promise.all([
      this.prisma.waChat.findMany({
        where,
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.waChat.count({ where }),
      this.prisma.waChat.groupBy({ by: ['leadStatus'], where: this.leadWhere(query, false), _count: { _all: true } }),
      this.facts.catalog(),
    ]);
    const counts = { new: 0, contacted: 0, subscribed: 0, not_interested: 0 } as Record<LeadStatus, number>;
    for (const g of grouped) counts[g.leadStatus] = g._count._all;
    return {
      rows: rows.map(toLead),
      rowCount,
      counts,
      yearOptions: catalog.options.map((o) => ({ value: `${o.system}:${o.year}`, label: o.label })),
    };
  }

  /** Every lead the filters admit, for the CSV — capped so an export is never a full-table dump. */
  async leadsForExport(query: LeadQuery): Promise<LeadRow[]> {
    const rows = await this.prisma.waChat.findMany({
      where: this.leadWhere(query),
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: 5000,
    });
    return rows.map(toLead);
  }

  async patchLead(id: string, patch: LeadPatch): Promise<LeadRow> {
    const chat = await this.prisma.waChat.findFirst({ where: { id, isLead: true }, select: { id: true } });
    if (!chat) throw new NotFoundException();
    const row = await this.prisma.waChat.update({
      where: { id },
      data: {
        ...(patch.status !== undefined ? { leadStatus: patch.status } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes?.trim() || null } : {}),
      },
    });
    return toLead(row);
  }

  // ── helpers ────────────────────────────────────────────────────────────

  /**
   * «قف» is honoured from TWO places: the campaign list (`marketing_opt_outs`,
   * Egyptian numbers only, which the admin can also clear), and the chat's own
   * flag for a number that list cannot hold. For an Egyptian number the list
   * is the truth, so removing someone from «طلبوا الإيقاف» lets the bot answer
   * them again.
   */
  async optedOut(phones: string[], chats: readonly Pick<WaChat, 'phone' | 'optedOutAt'>[]): Promise<Set<string>> {
    const listed = await this.prisma.marketingOptOut.findMany({
      where: { phone: { in: phones } },
      select: { phone: true },
    });
    const out = new Set(listed.map((row) => row.phone));
    for (const chat of chats) {
      if (chat.optedOutAt && !normalizeEgyptianPhone(chat.phone)) out.add(chat.phone);
    }
    return out;
  }

  private async accountNames(userIds: (string | null)[]): Promise<Map<string, string>> {
    const ids = [...new Set(userIds.filter((id): id is string => id !== null))];
    if (ids.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, studentProfile: { select: { fullName: true } } },
    });
    return new Map(users.map((u) => [u.id, u.studentProfile?.fullName ?? u.name]));
  }

  private toRow(
    chat: WaChat,
    last: { body: string; author: WaChatRow['previewAuthor'] } | null,
    optedOut: Set<string>,
    names: Map<string, string>,
  ): WaChatRow {
    return {
      id: chat.id,
      phone: chat.phone,
      pushName: chat.pushName,
      name: chat.userId ? (names.get(chat.userId) ?? null) : null,
      userId: chat.userId,
      who: chat.who,
      needsHuman: chat.needsHuman,
      botPaused: chat.botPaused,
      optedOut: optedOut.has(chat.phone),
      unread:
        chat.lastMessageAuthor === 'contact' && (chat.adminReadAt === null || chat.adminReadAt < chat.lastInboundAt),
      lastMessageAt: chat.lastMessageAt.toISOString(),
      preview: (last?.body ?? chat.lastMessage).slice(0, 160),
      previewAuthor: last?.author ?? 'contact',
    };
  }
}

function toLead(row: WaChat): LeadRow {
  return {
    id: row.id,
    phone: row.phone,
    pushName: row.pushName,
    yearLabel: row.yearLabel,
    status: row.leadStatus,
    intents: row.intents,
    firstMessage: row.firstMessage,
    lastMessage: row.lastMessage,
    firstMessageAt: row.firstMessageAt.toISOString(),
    lastMessageAt: row.lastMessageAt.toISOString(),
    messageCount: row.messageCount,
    notes: row.notes,
    userId: row.userId,
    convertedAt: row.convertedAt?.toISOString() ?? null,
    needsHuman: row.needsHuman,
  };
}
