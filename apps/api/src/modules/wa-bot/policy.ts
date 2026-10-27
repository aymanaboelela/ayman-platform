import type { BotSettings } from '@ayman/contracts/wa-bot/schemas';

/**
 * Whether the bot may answer one chat right now — the safety rules, as a pure
 * function so every one of them is tested without a clock, a database or a
 * phone.
 *
 * ## The order is the design
 *
 * The checks that mean "never" come before the ones that mean "not yet", so a
 * chat that should stay silent is never merely postponed into a reply later:
 *
 *   1. the feature / the switch is off                → skip
 *   2. the number asked to stop («قف»)               → skip, forever
 *   3. the admin paused the bot in this chat          → skip
 *   4. the other side looks like a bot (muted)        → skip
 *   5. a PERSON answered within the silence window    → skip
 *   6. this number had its day's replies              → skip
 *   7. the whole device had its day's replies         → skip
 *   8. quiet hours                                    → defer to their end
 *   9. the last bot reply here was too recent         → defer to the gap's end
 *
 * A skip marks the waiting messages handled (they stay in the inbox for a
 * person); a defer leaves them waiting and moves the chat's due time.
 */

export type SkipReason =
  | 'disabled'
  | 'optedOut'
  | 'paused'
  | 'muted'
  | 'human'
  | 'chatCap'
  | 'dailyCap';

export type Decision =
  | { readonly kind: 'send' }
  | { readonly kind: 'defer'; readonly until: Date; readonly reason: 'quiet' | 'gap' }
  | { readonly kind: 'skip'; readonly reason: SkipReason };

export interface PolicyChat {
  readonly botPaused: boolean;
  readonly optedOut: boolean;
  readonly mutedUntil: Date | null;
  readonly humanRepliedAt: Date | null;
  readonly lastBotReplyAt: Date | null;
  /** `YYYY-MM-DD` in Cairo, the day `botRepliesToday` counts. */
  readonly botRepliesDay: string | null;
  readonly botRepliesToday: number;
}

export interface PolicyInput {
  readonly now: Date;
  /** Both entitlements AND the device's own feature — any false is a skip. */
  readonly featureOn: boolean;
  readonly settings: BotSettings;
  readonly chat: PolicyChat;
  /** Bot replies already sent today across every chat. */
  readonly sentToday: number;
}

const HOUR_MS = 60 * 60 * 1000;

const CAIRO_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** The Cairo wall clock — `{ day: '2026-10-28', hour: 23, minute: 5 }`. */
export function cairoClock(now: Date): { day: string; hour: number; minute: number } {
  const parts = Object.fromEntries(CAIRO_PARTS.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/** Whether `hour` falls inside `[start, end)`, wrapping past midnight when start > end. */
export function inQuietHours(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/**
 * When quiet hours end, as an instant — `end:00` Cairo time, today or
 * tomorrow. Computed from the minutes left rather than by building a Cairo
 * date, so a DST change is the only thing that can shift it, and by an hour at
 * most.
 */
export function quietEndsAt(now: Date, end: number): Date {
  const { hour, minute } = cairoClock(now);
  let hoursLeft = (end - hour + 24) % 24;
  if (hoursLeft === 0) hoursLeft = 24;
  const ms = hoursLeft * HOUR_MS - minute * 60_000;
  // A minute past the hour so the next pass is unambiguously outside.
  return new Date(now.getTime() + ms + 60_000);
}

export function repliesToday(chat: Pick<PolicyChat, 'botRepliesDay' | 'botRepliesToday'>, now: Date): number {
  return chat.botRepliesDay === cairoClock(now).day ? chat.botRepliesToday : 0;
}

export function decide({ now, featureOn, settings, chat, sentToday }: PolicyInput): Decision {
  if (!featureOn || !settings.enabled) return { kind: 'skip', reason: 'disabled' };
  if (chat.optedOut) return { kind: 'skip', reason: 'optedOut' };
  if (chat.botPaused) return { kind: 'skip', reason: 'paused' };
  if (chat.mutedUntil && chat.mutedUntil > now) return { kind: 'skip', reason: 'muted' };
  if (
    chat.humanRepliedAt &&
    now.getTime() - chat.humanRepliedAt.getTime() < settings.handoffSilenceHours * HOUR_MS
  ) {
    return { kind: 'skip', reason: 'human' };
  }
  if (repliesToday(chat, now) >= settings.perChatDailyCap) return { kind: 'skip', reason: 'chatCap' };
  if (sentToday >= settings.dailyCap) return { kind: 'skip', reason: 'dailyCap' };

  if (settings.quietHoursEnabled) {
    const { hour } = cairoClock(now);
    if (inQuietHours(hour, settings.quietStartHour, settings.quietEndHour)) {
      return { kind: 'defer', until: quietEndsAt(now, settings.quietEndHour), reason: 'quiet' };
    }
  }

  if (chat.lastBotReplyAt) {
    const next = chat.lastBotReplyAt.getTime() + settings.minGapSeconds * 1000;
    if (next > now.getTime()) return { kind: 'defer', until: new Date(next), reason: 'gap' };
  }

  return { kind: 'send' };
}

/**
 * Inbound messages in the last minute past which a chat is treated as a bot
 * (or a person pasting on a loop) and muted for a day. A human asking
 * questions sends two or three; six in sixty seconds is a script.
 */
export const BURST_LIMIT = 6;
export const BURST_WINDOW_MS = 60_000;
export const MUTE_MS = 24 * HOUR_MS;

/**
 * How long after an inbound message the replier looks at the chat. Long
 * enough that «السلام عليكم» / «الكورس بكام» / «؟» typed as three messages is
 * read — and answered — as one, short enough to feel like somebody reading.
 */
export const DEBOUNCE_MS = 6_000;

/** One handoff notice per this long, however many questions go unmatched. */
export const HANDOFF_NOTICE_EVERY_MS = 6 * HOUR_MS;

/** The year question is asked at most this many times before the bot answers for every year. */
export const MAX_YEAR_ASKS = 2;
