import { Injectable, Logger } from '@nestjs/common';
import { copy } from '@ayman/contracts/copy';
import { copy as bot } from '@ayman/contracts/copy/wa-bot';
import type { AskTurn } from '@ayman/contracts/assistant/ask';
import {
  YEAR_INTENTS,
  classify,
  looksAutomated,
  parseYear,
  type BotIntent,
  type YearOption,
} from '@ayman/contracts/wa-bot/intents';
import type { BotAction, BotSettings } from '@ayman/contracts/wa-bot/schemas';
import { normalizeArabic } from '@ayman/contracts/wa-bot/normalize';
import { isOptOutMessage } from '@ayman/contracts/marketing/render';
import { isFeatureEnabled } from '../../common/entitlements';
import { tenantName } from '../../common/tenant';
import { AssistantAiService } from '../assistant/ai/assistant-ai.service';
import { HANDOFF_NOTICE_EVERY_MS, MAX_YEAR_ASKS } from './policy';
import {
  booksBlock,
  courseBlock,
  firstName,
  freeLessonsBlock,
  paymentBlock,
  personalBlock,
  priceBlock,
  renderTemplate,
  scheduleBlock,
  subscribeBlock,
  type CourseFact,
} from './render';
import type { Identity } from './wa-bot-identity.service';
import { WaBotFactsService } from './wa-bot-facts.service';
import { WaBotSettingsService } from './wa-bot-settings.service';

/** The parts of a chat the brain reads. */
export interface BrainChat {
  readonly awaitingYear: boolean;
  readonly pendingIntents: readonly string[];
  readonly yearSystem: string | null;
  readonly year: number | null;
  readonly yearAsks: number;
  readonly lastHandoffNoticeAt: Date | null;
  /** Whether the bot has answered this number before — the first reply greets. */
  readonly repliedBefore: boolean;
}

export const FRESH_CHAT: BrainChat = {
  awaitingYear: false,
  pendingIntents: [],
  yearSystem: null,
  year: null,
  yearAsks: 0,
  lastHandoffNoticeAt: null,
  repliedBefore: false,
};

export interface BrainInput {
  /** The waiting inbound messages, oldest first, joined by newlines. */
  readonly text: string;
  readonly identity: Identity;
  readonly chat: BrainChat;
  /** The last few lines of the chat, for the model only. */
  readonly history: readonly AskTurn[];
  readonly settings: BotSettings;
  readonly now: Date;
}

export interface BrainResult {
  readonly action: BotAction;
  readonly reply: string | null;
  /** What was understood — recorded on the messages and on the lead. */
  readonly intents: readonly string[];
  readonly reason: string | null;
  readonly patch: {
    readonly awaitingYear?: boolean;
    readonly pendingIntents?: readonly string[];
    readonly yearAsks?: number;
    readonly year?: YearOption;
    readonly needsHuman?: boolean;
    readonly handoffNotice?: boolean;
  };
}

/** How long the model may take before the chat goes to a person instead. */
const MODEL_TIMEOUT_MS = 25_000;

/**
 * What to say back — the half of the bot that reads, as opposed to the half
 * that decides whether it may speak at all (`policy.ts`).
 *
 * ## The order, for one batch of waiting messages
 *
 *   1. «قف» and anything that reads like another bot → nothing.
 *   2. Rules (`classify`): the built-in intents plus the admin's own.
 *   3. A year the message names, or the answer to the year question the bot
 *      asked last time.
 *   4. «أكلم حد» → hand to a person, with the one sentence saying so.
 *   5. A question whose answer depends on the year, with the year unknown →
 *      ask it (numbered options), remembering what was asked.
 *   6. The answers, rendered from live facts.
 *   7. Nothing matched → المساعد's model, if this stack has one and the admin
 *      allows it; its own «I'm not sure» marker, or no model, → a person.
 *
 * The model only ever sees what a student could read on the site: no account
 * data is passed to it, ever. «اشتراكك» lines come from the rules path alone.
 */
@Injectable()
export class WaBotBrainService {
  private readonly logger = new Logger(WaBotBrainService.name);

  constructor(
    private readonly facts: WaBotFactsService,
    private readonly answers: WaBotSettingsService,
    private readonly ai: AssistantAiService,
  ) {}

  /** Whether the model fallback can run on this stack at all. */
  get modelAvailable(): boolean {
    return this.ai.available && isFeatureEnabled('assistant');
  }

  async compose(input: BrainInput): Promise<BrainResult> {
    const text = input.text.trim();
    if (!text) return silent('empty');
    if (isOptOutMessage(text)) return silent('optOut');
    if (looksAutomated(text)) return silent('automated');

    const [resolved, catalog] = await Promise.all([this.answers.resolved(), this.facts.catalog()]);
    const { options } = catalog;
    const cls = classify(text, resolved.classify);

    // ── the year ──────────────────────────────────────────────────────────
    const said = parseYear(text, options, input.chat.awaitingYear);
    const known = said ?? this.knownYear(input, options);
    const patch: { -readonly [K in keyof BrainResult['patch']]: BrainResult['patch'][K] } = {};
    if (said) patch.year = said;

    let intents = [...cls.intents];
    if (input.chat.awaitingYear) {
      if (said || intents.length > 0) {
        patch.awaitingYear = false;
        patch.pendingIntents = [];
        if (intents.length === 0) intents = [...input.chat.pendingIntents];
        if (intents.length === 0) intents = ['whichCourse'];
      } else if (input.chat.yearAsks < MAX_YEAR_ASKS) {
        return this.askYear(options, input.chat, input.chat.pendingIntents, true);
      } else {
        // Asked twice and still no year: answer for every year rather than
        // asking a third time. A bot that keeps repeating its question is the
        // one people block.
        patch.awaitingYear = false;
        patch.pendingIntents = [];
        intents = input.chat.pendingIntents.length > 0 ? [...input.chat.pendingIntents] : ['whichCourse'];
      }
    } else if (said && intents.length === 0) {
      intents = ['whichCourse'];
    }

    // ── nothing matched ───────────────────────────────────────────────────
    if (intents.length === 0) {
      if (cls.greeting) {
        return {
          action: 'answer',
          reply: this.render(resolved.text.get('greeting') ?? bot.answers.greeting, await this.vars(input, known, catalog.courses), input, cls.greeting, text, true),
          intents: ['greeting'],
          reason: null,
          patch,
        };
      }
      if (cls.thanks) return { ...silent('thanks'), patch };
      return this.fallback(input, patch);
    }

    // ── a person, please ──────────────────────────────────────────────────
    if (intents.includes('human')) {
      return {
        action: 'handoff',
        reply: renderTemplate(resolved.text.get('human') ?? bot.answers.human, {}),
        intents,
        reason: null,
        patch: { ...patch, needsHuman: true, handoffNotice: true },
      };
    }

    // ── the year first, when the answer depends on it ────────────────────
    const needsYear = intents.some((key) => YEAR_INTENTS.includes(key as BotIntent));
    if (needsYear && !known && options.length > 1 && input.chat.yearAsks < MAX_YEAR_ASKS && !input.chat.awaitingYear) {
      return withSalam(this.askYear(options, input.chat, intents, false, patch), text);
    }

    // ── the answers ───────────────────────────────────────────────────────
    const courses = known
      ? catalog.courses.filter((c) => c.system === known.system && c.year === known.year)
      : catalog.courses;
    const vars = await this.vars(input, known, catalog.courses);

    const parts: string[] = [];
    let unanswerable = false;
    for (const key of intents) {
      if (YEAR_INTENTS.includes(key as BotIntent) && courses.length === 0) {
        unanswerable = true;
        continue;
      }
      if (key === 'books' && vars['الكتب'] === null) {
        unanswerable = true;
        continue;
      }
      const template = resolved.text.get(key);
      if (!template) continue;
      const rendered = renderTemplate(template, vars);
      if (rendered) parts.push(rendered);
      else unanswerable = true;
    }

    if (parts.length === 0) return this.fallback(input, patch, intents);

    const reply = this.render(parts.join('\n\n'), {}, input, cls.greeting, text, false);
    return {
      action: 'answer',
      reply,
      intents,
      reason: null,
      // A half-answered message («أسعار كورسات سنة مالهاش كورسات») still needs a person.
      patch: unanswerable ? { ...patch, needsHuman: true } : patch,
    };
  }

  /** The year this person already gave — on the chat, or in their onboarding. */
  private knownYear(input: BrainInput, options: readonly YearOption[]): YearOption | null {
    if (options.length === 1) return options[0]!;
    const fromChat = options.find((o) => o.system === input.chat.yearSystem && o.year === input.chat.year);
    if (fromChat) return fromChat;
    const { system, year } = input.identity;
    if (year === null) return null;
    const exact = options.find((o) => o.system === system && o.year === year);
    if (exact) return exact;
    const sameYear = options.filter((o) => o.year === year);
    return sameYear.length === 1 ? sameYear[0]! : null;
  }

  private askYear(
    options: readonly YearOption[],
    chat: BrainChat,
    intents: readonly string[],
    retry: boolean,
    patch: BrainResult['patch'] = {},
  ): BrainResult {
    const list = options.map((option, index) => `${index + 1}- ${option.label}`).join('\n');
    return {
      action: 'askYear',
      reply: renderTemplate(retry ? bot.reply.yearRetry : bot.reply.yearQuestion, { الاختيارات: list }),
      intents,
      reason: null,
      patch: { ...patch, awaitingYear: true, pendingIntents: intents, yearAsks: chat.yearAsks + 1 },
    };
  }

  private async fallback(input: BrainInput, patch: BrainResult['patch'], intents: readonly string[] = []): Promise<BrainResult> {
    if (input.settings.aiFallback && this.modelAvailable) {
      const answer = await this.askModel(input.text, input.history);
      if (answer) {
        return {
          action: 'model',
          reply: `${answer}\n\n${bot.reply.modelFooter}`,
          intents,
          reason: null,
          patch,
        };
      }
    }
    const recent =
      input.chat.lastHandoffNoticeAt &&
      input.now.getTime() - input.chat.lastHandoffNoticeAt.getTime() < HANDOFF_NOTICE_EVERY_MS;
    return {
      action: recent ? 'silent' : 'handoff',
      reply: recent ? null : bot.reply.handoff,
      intents,
      reason: recent ? 'handoffNoticeRecent' : null,
      patch: { ...patch, needsHuman: true, handoffNotice: !recent },
    };
  }

  /**
   * المساعد's own model, answering from the platform's public facts only.
   *
   * `null` — so a PERSON gets it — when the model said it was not sure (its
   * `escalate`), refused, failed, took too long, or when only the written
   * script answered (`meta.provider` stays null): word-overlap guesses are
   * fine inside a chat panel with a «contact» button under them, and not fine
   * as a WhatsApp message from the instructor's number.
   */
  private async askModel(question: string, history: readonly AskTurn[]): Promise<string | null> {
    const meta: { provider: string | null } = { provider: null };
    let text = '';
    let escalate = false;
    let links: string[] = [];
    try {
      const signal = AbortSignal.timeout(MODEL_TIMEOUT_MS);
      for await (const event of this.ai.answer(question.slice(0, 1000), history, signal, null, meta)) {
        if (event.t === 'delta') text += event.text;
        else if (event.t === 'error') return null;
        else if (event.t === 'done') {
          escalate = event.escalate;
          links = (event.actions ?? []).map((action) => `${action.label}: ${this.facts.appUrl}${action.href}`);
        }
      }
    } catch (error) {
      this.logger.warn(`wa-bot model fallback failed: ${error instanceof Error ? error.message : 'unknown'}`);
      return null;
    }
    const trimmed = text.trim();
    if (!meta.provider || escalate || !trimmed || trimmed === copy.assistant.ai.refused) return null;
    return [trimmed, ...links].join('\n');
  }

  /** Every placeholder's value for this reply — read live, see `WaBotFactsService`. */
  private async vars(
    input: BrainInput,
    year: YearOption | null,
    all: readonly CourseFact[],
  ): Promise<Record<string, string | null>> {
    const appUrl = this.facts.appUrl;
    const courses = year ? all.filter((c) => c.system === year.system && c.year === year.year) : all;
    const [site, books, personal] = await Promise.all([
      this.facts.site(),
      this.facts.books(),
      input.identity.userId && (input.identity.who === 'student' || input.identity.who === 'parent')
        ? this.facts.personal(input.identity.userId, input.now)
        : Promise.resolve([]),
    ]);
    return {
      السنة: year?.label ?? bot.reply.allYears,
      الأسعار: courses.length > 0 ? priceBlock(courses, appUrl) : null,
      الكورسات: courses.length > 0 ? courseBlock(courses, appUrl) : null,
      الاشتراك: courses.length > 0 ? subscribeBlock(courses, appUrl) : null,
      الحصص_المجانية: courses.length > 0 ? freeLessonsBlock(courses, appUrl) : null,
      المواعيد: scheduleBlock(courses) || null,
      الدفع: paymentBlock({ instapay: site.contact.instapay ?? null, vodafoneCash: site.contact.vodafoneCash ?? null }),
      الكتب: books === null ? null : booksBlock(books, site.rates),
      الكتب_رابط: books === null ? null : `${appUrl}/books`,
      التسجيل: `${appUrl}/register`,
      الموقع: appUrl,
      القناة: site.contact.whatsappChannel ?? null,
      المنصة: tenantName(copy.site.platformName),
      اشتراكك:
        personal.length > 0
          ? personalBlock(
              personal,
              input.identity.who === 'parent'
                ? { kind: 'parent', childName: input.identity.name }
                : { kind: 'student' },
              appUrl,
            )
          : null,
    };
  }

  /**
   * The finished message: the greeting they opened with, answered in kind,
   * on top of the answer. «وعليكم السلام» to «السلام عليكم», the student's own
   * first name when the number is theirs.
   */
  private render(
    body: string,
    vars: Record<string, string | null>,
    input: BrainInput,
    greeted: boolean,
    text: string,
    greetingOnly: boolean,
  ): string {
    const rendered = renderTemplate(body, vars);
    const salam = /(^| )s?salam|سلام/u.test(normalizeArabic(text));
    let opener: string | null = null;
    if (salam) opener = bot.reply.greetSalam;
    else if (greetingOnly) opener = null;
    else if (greeted || (input.identity.who !== 'lead' && !input.chat.repliedBefore)) {
      opener =
        input.identity.who === 'student' && input.identity.name
          ? bot.reply.greetStudent.replace('{name}', firstName(input.identity.name))
          : input.identity.who === 'parent'
            ? bot.reply.greetParent
            : bot.reply.greetHello;
    }
    return opener ? `${opener}\n${rendered}` : rendered;
  }
}

/** «وعليكم السلام» above the year question too — it is the first thing they read back. */
function withSalam(result: BrainResult, text: string): BrainResult {
  if (!result.reply || !/(^| )s?salam|سلام/u.test(normalizeArabic(text))) return result;
  return { ...result, reply: `${bot.reply.greetSalam}\n${result.reply}` };
}

function silent(reason: string): BrainResult {
  return { action: 'silent', reply: null, intents: [], reason, patch: {} };
}
