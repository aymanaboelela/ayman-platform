import { z } from '@ayman/contracts/zod';
import type { Pacing } from '@ayman/contracts/marketing/pacing';

/**
 * «مين كلّمني على واتساب قبل كده» — the chats that already existed on the
 * linked number before the platform was linked to it.
 *
 * ## Where the answer comes from
 *
 * When a WhatsApp number is linked as a companion device, the phone pushes it a
 * one-time history sync: the chat list, the most recent messages in each chat,
 * and the LID↔phone mappings for the people in them. The sidecar
 * (`services/wa/src/history-chats.mjs`) reduces that to COUNTS AND TIMESTAMPS
 * per phone number — never a message body — and posts it to
 * `POST /api/marketing/wa/history`, which keeps it in `wa_history_chats`.
 *
 * It arrives ONCE, on the first connection after a link. A reconnect or a
 * redeploy gets nothing new (the server only re-sends after a fresh pairing),
 * which is why the sidecar retries its posts instead of dropping them.
 *
 * ## Why this is the axis that matters for a WhatsApp number
 *
 * A message into a chat that already exists is an ordinary message. A message
 * to somebody who never had a chat with the number is a NEW-CHAT INITIATION —
 * the one kind of traffic WhatsApp meters separately, answers with nack 463,
 * and bans numbers for in bursts. So «كلّمني» is the safe audience and
 * «مكلّمنيش» is the risky one, and the campaign form says so.
 */

/**
 * The two answers. `null` (the default everywhere) is "no filter on this axis",
 * the same convention every other audience axis and list filter uses.
 *
 * - `chatted` — the number has a chat with this phone: one that came in the
 *   history sync, or one somebody opened after linking (`wa_chats`).
 * - `never` — neither. The risky one.
 */
export const WA_HISTORY_FILTERS = ['chatted', 'never'] as const;
export type WaHistoryFilter = (typeof WA_HISTORY_FILTERS)[number];
export const WaHistoryFilterSchema = z.enum(WA_HISTORY_FILTERS);

/**
 * One phone number, as the sidecar reports it. Counts and timestamps only —
 * the schema has nowhere to put a message body, deliberately, so a future
 * sidecar change cannot start shipping chat contents through this route.
 *
 * `theyWroteToUs` is "at least one message FROM them was in the synced
 * window", not "they have ever written": the phone sends recent messages
 * only, so a chat whose last word from them is older than the window reads
 * `false` while still being a chat. That is why the audience axis keys on
 * `hasChat` and this is kept for the summary and the screens.
 */
export const WaHistoryEntrySchema = z.object({
  phone: z.string().trim().min(8).max(20),
  hasChat: z.boolean(),
  theyWroteToUs: z.boolean(),
  inboundCount: z.number().int().min(0).max(1_000_000).default(0),
  lastMessageAt: z.iso.datetime().nullable().default(null),
  lastInboundAt: z.iso.datetime().nullable().default(null),
});
export type WaHistoryEntry = z.infer<typeof WaHistoryEntrySchema>;

/** The sidecar batches at 500; the ceiling is twice that so a retuned batch
 *  size on one side does not become a 400 on the other. */
export const WA_HISTORY_BATCH_MAX = 1000;

export const WaHistoryIngestSchema = z.object({
  entries: z.array(WaHistoryEntrySchema).min(1).max(WA_HISTORY_BATCH_MAX),
});
export type WaHistoryIngest = z.infer<typeof WaHistoryIngestSchema>;

/** `GET /api/admin/wa-history/summary` — what the screens say about it. */
export const WaHistorySummarySchema = z.object({
  /** When the last history batch landed. `null` = no history has ever
   *  arrived on this stack, so «مكلّمنيش» means «كل الناس». */
  syncedAt: z.iso.datetime().nullable(),
  /** Phones with a chat — from the history sync or opened since. */
  chats: z.number().int(),
  /** Of the history chats, the ones with a message from them in the window. */
  wrote: z.number().int(),
  /** History chats matched to a student account / to a student's parent. */
  students: z.number().int(),
  parents: z.number().int(),
});
export type WaHistorySummary = z.infer<typeof WaHistorySummarySchema>;

/**
 * The pacing a «مكلّمنيش» campaign starts from: whatever the form holds, but
 * never FASTER than `floor` (the conservative `DEFAULT_PACING`) on any brake.
 *
 * Every message in such a campaign is a new-chat initiation, so the brakes the
 * defaults were sized for (a brand-new number, where every message is one) are
 * exactly the right ones. A pacing the admin already made slower is kept —
 * this only ever slows a field down, it never speeds one up.
 */
export function noFasterThan(pacing: Pacing, floor: Pacing): Pacing {
  const minDelaySeconds = Math.max(pacing.minDelaySeconds, floor.minDelaySeconds);
  return {
    minDelaySeconds,
    maxDelaySeconds: Math.max(pacing.maxDelaySeconds, floor.maxDelaySeconds, minDelaySeconds),
    // `0` means "no batching" — the fastest setting, not the slowest.
    batchSize:
      pacing.batchSize === 0 ? floor.batchSize : floor.batchSize === 0 ? pacing.batchSize : Math.min(pacing.batchSize, floor.batchSize),
    batchPauseMinutes: Math.max(pacing.batchPauseMinutes, floor.batchPauseMinutes),
    dailyCap: Math.min(pacing.dailyCap, floor.dailyCap),
    // A narrower window is slower; never widen the admin's.
    windowStartHour: Math.max(pacing.windowStartHour, floor.windowStartHour),
    windowEndHour: Math.max(
      Math.min(pacing.windowEndHour, floor.windowEndHour),
      Math.max(pacing.windowStartHour, floor.windowStartHour) + 1,
    ),
  };
}
