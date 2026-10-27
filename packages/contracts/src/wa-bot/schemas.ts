import { z } from '@ayman/contracts/zod';
import { BOT_INTENTS } from '@ayman/contracts/wa-bot/intents';

/**
 * The wire shapes of «الرد الآلي» — the WhatsApp auto-reply bot, its leads
 * list («المهتمين») and the WhatsApp inbox it hands questions to.
 *
 * One file for all three because they are one feature behind one entitlement
 * (`whatsapp.bot`) and one table of chats: a lead IS a chat whose number
 * matched no account when it first wrote.
 */

export const BotIntentSchema = z.enum(BOT_INTENTS);

// ── settings ─────────────────────────────────────────────────────────────

/**
 * The bot's switches.
 *
 * ## The ceilings are the product, not the form
 *
 * `minGapSeconds` cannot go below 30 and `perChatDailyCap` cannot go above 20:
 * past those, a bot answering a bot (or one impatient person) stops being
 * "helpful" and starts being the burst pattern WhatsApp bans a new number for.
 * The admin may make the bot MORE careful, never less.
 */
export const BotSettingsSchema = z
  .object({
    enabled: z.boolean(),
    /** Cairo hours. `quietStartHour` > `quietEndHour` wraps past midnight. */
    quietHoursEnabled: z.boolean(),
    quietStartHour: z.number().int().min(0).max(23),
    quietEndHour: z.number().int().min(0).max(23),
    /** How long a human reply keeps the bot silent in that chat. */
    handoffSilenceHours: z.number().int().min(1).max(168),
    /** Let المساعد's model answer what no rule matched, from the platform's own facts. */
    aiFallback: z.boolean(),
    minGapSeconds: z.number().int().min(30).max(3600),
    perChatDailyCap: z.number().int().min(1).max(20),
    /** Across every chat, per Cairo day. */
    dailyCap: z.number().int().min(10).max(500),
  })
  .strict();
export type BotSettings = z.infer<typeof BotSettingsSchema>;

export const DEFAULT_BOT_SETTINGS: BotSettings = {
  enabled: true,
  quietHoursEnabled: true,
  quietStartHour: 23,
  quietEndHour: 8,
  handoffSilenceHours: 12,
  aiFallback: true,
  minGapSeconds: 30,
  perChatDailyCap: 20,
  dailyCap: 200,
};

// ── answers ──────────────────────────────────────────────────────────────

/** `price`… for a built-in, `custom:<uuid>` for one the admin wrote. */
export const BotAnswerKeySchema = z
  .string()
  .regex(/^(?:[a-zA-Z]+|custom:[0-9a-f-]{36})$/u, 'not an answer key');

const KeywordsSchema = z.array(z.string().trim().min(1).max(60)).max(60);

export const BotAnswerRowSchema = z.object({
  key: z.string(),
  builtIn: z.boolean(),
  label: z.string(),
  answer: z.string(),
  /** The copy-table default, for «رجوع للأصل». `null` on a custom answer. */
  defaultAnswer: z.string().nullable(),
  /** The admin's own keywords. */
  keywords: z.array(z.string()),
  /** The built-in vocabulary, read-only. Empty on a custom answer. */
  defaultKeywords: z.array(z.string()),
  enabled: z.boolean(),
  /** A stored row exists — the answer is not the default any more. */
  customized: z.boolean(),
  updatedAt: z.iso.datetime().nullable(),
});
export type BotAnswerRow = z.infer<typeof BotAnswerRowSchema>;

export const BotAnswerPutSchema = z
  .object({
    /** Only read for a custom answer; a built-in's label is the copy table's. */
    label: z.string().trim().min(1).max(80).optional(),
    answer: z.string().trim().min(1).max(1500),
    keywords: KeywordsSchema,
    enabled: z.boolean(),
  })
  .strict();
export type BotAnswerPut = z.infer<typeof BotAnswerPutSchema>;

export const BotAnswerCreateSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    answer: z.string().trim().min(1).max(1500),
    keywords: KeywordsSchema.min(1),
    enabled: z.boolean(),
  })
  .strict();
export type BotAnswerCreate = z.infer<typeof BotAnswerCreateSchema>;

// ── the dry run ──────────────────────────────────────────────────────────

export const BotPreviewRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(1000),
    /** Answer as if this number had written — a student's, to see their own reply. */
    phone: z.string().trim().max(20).optional(),
  })
  .strict();
export type BotPreviewRequest = z.infer<typeof BotPreviewRequestSchema>;

export const BOT_ACTIONS = ['answer', 'askYear', 'handoff', 'model', 'silent'] as const;
export type BotAction = (typeof BOT_ACTIONS)[number];

export const BotPreviewSchema = z.object({
  action: z.enum(BOT_ACTIONS),
  intents: z.array(z.string()),
  reply: z.string().nullable(),
  /** Why it would stay silent, when it would. */
  reason: z.string().nullable(),
  who: z.enum(['student', 'parent', 'lead']),
});
export type BotPreview = z.infer<typeof BotPreviewSchema>;

// ── chats and leads ──────────────────────────────────────────────────────

export const LEAD_STATUSES = ['new', 'contacted', 'subscribed', 'not_interested'] as const;
export const LeadStatusSchema = z.enum(LEAD_STATUSES);
export type LeadStatus = z.infer<typeof LeadStatusSchema>;

export const CHAT_WHO = ['student', 'parent', 'lead'] as const;
export const ChatWhoSchema = z.enum(CHAT_WHO);
export type ChatWho = z.infer<typeof ChatWhoSchema>;

/** Who wrote a line: them, the bot, the admin from the dashboard, or someone on the phone itself. */
export const CHAT_AUTHORS = ['contact', 'bot', 'admin', 'phone'] as const;
export type ChatAuthor = (typeof CHAT_AUTHORS)[number];

export const WaChatMessageSchema = z.object({
  id: z.string(),
  author: z.enum(CHAT_AUTHORS),
  body: z.string(),
  intents: z.array(z.string()),
  /** `failed` when the device refused it; null for an inbound line. */
  status: z.enum(['sent', 'failed']).nullable(),
  createdAt: z.iso.datetime(),
});
export type WaChatMessage = z.infer<typeof WaChatMessageSchema>;

export const WaChatRowSchema = z.object({
  id: z.uuid(),
  phone: z.string(),
  pushName: z.string().nullable(),
  /** The account's name when the number matched one. */
  name: z.string().nullable(),
  userId: z.string().nullable(),
  who: ChatWhoSchema,
  needsHuman: z.boolean(),
  botPaused: z.boolean(),
  optedOut: z.boolean(),
  unread: z.boolean(),
  lastMessageAt: z.iso.datetime(),
  preview: z.string(),
  previewAuthor: z.enum(CHAT_AUTHORS),
});
export type WaChatRow = z.infer<typeof WaChatRowSchema>;

export const WaChatDetailSchema = WaChatRowSchema.extend({
  messages: z.array(WaChatMessageSchema),
  leadStatus: LeadStatusSchema.nullable(),
  yearLabel: z.string().nullable(),
  notes: z.string().nullable(),
  /** Until when a human reply keeps the bot quiet here, if it does. */
  silentUntil: z.iso.datetime().nullable(),
});
export type WaChatDetail = z.infer<typeof WaChatDetailSchema>;

export const WA_CHAT_FILTERS = ['handoff', 'unread', 'all'] as const;
export const WaChatFilterSchema = z.enum(WA_CHAT_FILTERS).default('handoff');
export type WaChatFilter = z.infer<typeof WaChatFilterSchema>;

export const WaReplySchema = z.object({ text: z.string().trim().min(1).max(2000) }).strict();
export type WaReply = z.infer<typeof WaReplySchema>;

export const WaChatPatchSchema = z
  .object({
    needsHuman: z.boolean().optional(),
    botPaused: z.boolean().optional(),
  })
  .strict();
export type WaChatPatch = z.infer<typeof WaChatPatchSchema>;

export const LeadRowSchema = z.object({
  id: z.uuid(),
  phone: z.string(),
  pushName: z.string().nullable(),
  yearLabel: z.string().nullable(),
  status: LeadStatusSchema,
  intents: z.array(z.string()),
  firstMessage: z.string(),
  lastMessage: z.string(),
  firstMessageAt: z.iso.datetime(),
  lastMessageAt: z.iso.datetime(),
  messageCount: z.number().int(),
  notes: z.string().nullable(),
  /** Set once the number signed up — the lead has an account now. */
  userId: z.string().nullable(),
  convertedAt: z.iso.datetime().nullable(),
  needsHuman: z.boolean(),
});
export type LeadRow = z.infer<typeof LeadRowSchema>;


export const LeadQuerySchema = z.object({
  status: LeadStatusSchema.optional(),
  /** A built-in intent the lead asked about. */
  intent: BotIntentSchema.optional(),
  /** `bacalorya:2` — system and year, as the options list them. */
  year: z
    .string()
    .regex(/^[a-z_]+:[1-9]$/u)
    .optional(),
  q: z.string().trim().max(60).optional(),
});
export type LeadQuery = z.infer<typeof LeadQuerySchema>;

export const LeadPatchSchema = z
  .object({
    status: LeadStatusSchema.optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();
export type LeadPatch = z.infer<typeof LeadPatchSchema>;

/** The year filter's choices — the same numbered options the bot offers. */
export const LeadYearOptionSchema = z.object({ value: z.string(), label: z.string() });

export const LeadListSchema = z.object({
  rows: z.array(LeadRowSchema),
  rowCount: z.number().int().min(0),
  /** Per status, ignoring the status filter — the chips above the table. */
  counts: z.record(LeadStatusSchema, z.number().int()),
  yearOptions: z.array(LeadYearOptionSchema),
});
export type LeadList = z.infer<typeof LeadListSchema>;

export const BotSettingsReadSchema = z.object({
  settings: BotSettingsSchema,
  /** A model key exists on this stack — the fallback switch means something. */
  modelAvailable: z.boolean(),
});
export type BotSettingsRead = z.infer<typeof BotSettingsReadSchema>;
