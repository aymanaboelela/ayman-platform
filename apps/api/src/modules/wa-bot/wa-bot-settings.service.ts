import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { copy as bot } from '@ayman/contracts/copy/wa-bot';
import { BOT_INTENTS, DEFAULT_KEYWORDS, type BotIntent, type ClassifyOptions } from '@ayman/contracts/wa-bot/intents';
import {
  BotSettingsSchema,
  DEFAULT_BOT_SETTINGS,
  type BotAnswerCreate,
  type BotAnswerPut,
  type BotAnswerRow,
  type BotSettings,
} from '@ayman/contracts/wa-bot/schemas';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { Prisma } from '../../generated/prisma/client';
import type { AuditAction } from '@ayman/contracts/admin/audit';

/** What the brain needs from the answers table, resolved over the copy defaults. */
export interface ResolvedAnswers {
  /** Built-in intent or `custom:<id>` → the text to send. */
  readonly text: ReadonlyMap<string, string>;
  readonly classify: ClassifyOptions;
}

/**
 * The bot's switches and its answers — the two things the admin edits.
 *
 * ## Settings: one jsonb row, parsed over the defaults
 *
 * A field added to `BotSettingsSchema` later reads as its default on every
 * stack without a migration, the same reason `site_settings` is jsonb.
 *
 * ## Answers: only what was CHANGED is stored
 *
 * See `copy/wa-bot.ts` — a built-in intent without a row is the copy default.
 */
@Injectable()
export class WaBotSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async settings(): Promise<BotSettings> {
    const row = await this.prisma.waBotSettings.findUnique({ where: { id: 1 }, select: { data: true } });
    const parsed = BotSettingsSchema.safeParse({ ...DEFAULT_BOT_SETTINGS, ...((row?.data as object) ?? {}) });
    // A row that no longer parses (a ceiling tightened in a later release) is
    // read as the defaults rather than taking the bot down — and the defaults
    // are the careful values.
    return parsed.success ? parsed.data : DEFAULT_BOT_SETTINGS;
  }

  async saveSettings(input: BotSettings, actorId: string): Promise<BotSettings> {
    const data = BotSettingsSchema.parse(input) as unknown as Prisma.InputJsonValue;
    await this.prisma.waBotSettings.upsert({ where: { id: 1 }, create: { id: 1, data }, update: { data } });
    await this.audit.record({
      action: 'wa-bot:settings',
      resourceType: 'wa_bot',
      resourceId: null,
      outcome: 'success',
      actorUserId: actorId,
      metadata: { settings: input },
    });
    return this.settings();
  }

  async rows(): Promise<BotAnswerRow[]> {
    const stored = await this.prisma.waBotAnswer.findMany({ orderBy: [{ createdAt: 'asc' }, { key: 'asc' }] });
    const byKey = new Map(stored.map((row) => [row.key, row]));

    const builtIns: BotAnswerRow[] = BOT_INTENTS.map((intent) => {
      const row = byKey.get(intent);
      return {
        key: intent,
        builtIn: true,
        label: bot.labels[intent],
        answer: row?.answer ?? bot.answers[intent],
        defaultAnswer: bot.answers[intent],
        keywords: row?.keywords ?? [],
        defaultKeywords: [...DEFAULT_KEYWORDS[intent]],
        enabled: row?.enabled ?? true,
        customized: row !== undefined,
        updatedAt: row?.updatedAt.toISOString() ?? null,
      };
    });

    const custom: BotAnswerRow[] = stored
      .filter((row) => row.key.startsWith('custom:'))
      .map((row) => ({
        key: row.key,
        builtIn: false,
        label: row.label ?? row.key,
        answer: row.answer,
        defaultAnswer: null,
        keywords: row.keywords,
        defaultKeywords: [],
        enabled: row.enabled,
        customized: true,
        updatedAt: row.updatedAt.toISOString(),
      }));

    return [...builtIns, ...custom];
  }

  async resolved(): Promise<ResolvedAnswers> {
    const rows = await this.rows();
    const text = new Map<string, string>();
    const extraKeywords: Partial<Record<BotIntent, string[]>> = {};
    const disabled: BotIntent[] = [];
    const custom: { key: string; keywords: string[] }[] = [];
    for (const row of rows) {
      text.set(row.key, row.answer);
      if (row.builtIn) {
        const intent = row.key as BotIntent;
        if (!row.enabled) disabled.push(intent);
        if (row.keywords.length > 0) extraKeywords[intent] = row.keywords;
      } else if (row.enabled) {
        custom.push({ key: row.key, keywords: row.keywords });
      }
    }
    return { text, classify: { extraKeywords, disabled, custom } };
  }

  async put(key: string, input: BotAnswerPut, actorId: string): Promise<BotAnswerRow> {
    const builtIn = (BOT_INTENTS as readonly string[]).includes(key);
    if (!builtIn) {
      const existing = await this.prisma.waBotAnswer.findUnique({ where: { key }, select: { key: true } });
      if (!existing) throw new NotFoundException();
    }
    const data = {
      answer: input.answer,
      keywords: dedupe(input.keywords),
      enabled: input.enabled,
      updatedById: actorId,
      ...(builtIn ? {} : input.label ? { label: input.label } : {}),
    };
    await this.prisma.waBotAnswer.upsert({ where: { key }, create: { key, ...data }, update: data });
    await this.auditAnswer('wa-bot:answer-update', key, actorId);
    return this.row(key);
  }

  async create(input: BotAnswerCreate, actorId: string): Promise<BotAnswerRow> {
    const key = `custom:${randomUUID()}`;
    await this.prisma.waBotAnswer.create({
      data: {
        key,
        label: input.label,
        answer: input.answer,
        keywords: dedupe(input.keywords),
        enabled: input.enabled,
        updatedById: actorId,
      },
    });
    await this.auditAnswer('wa-bot:answer-create', key, actorId);
    return this.row(key);
  }

  /** «رجوع للأصل» on a built-in; «حذف» on a custom answer. Same row, same delete. */
  async remove(key: string, actorId: string): Promise<void> {
    if (!(BOT_INTENTS as readonly string[]).includes(key) && !key.startsWith('custom:')) {
      throw new BadRequestException('not an answer key');
    }
    await this.prisma.waBotAnswer.deleteMany({ where: { key } });
    await this.auditAnswer('wa-bot:answer-reset', key, actorId);
  }

  private async row(key: string): Promise<BotAnswerRow> {
    const row = (await this.rows()).find((entry) => entry.key === key);
    if (!row) throw new NotFoundException();
    return row;
  }

  private auditAnswer(action: AuditAction, key: string, actorId: string) {
    return this.audit.record({
      action,
      resourceType: 'wa_bot_answer',
      resourceId: key,
      outcome: 'success',
      actorUserId: actorId,
    });
  }
}

function dedupe(keywords: readonly string[]): string[] {
  return [...new Set(keywords.map((k) => k.trim()).filter(Boolean))];
}
