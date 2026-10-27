import { cairoParts, fromCairoWall, type Pacing } from '@ayman/contracts/marketing/pacing';

/**
 * How many WhatsApp messages the NUMBER may send in one Cairo day — every
 * sender together: campaigns, shipping notices, anything added later.
 *
 * ## Why a ceiling on the number and not only on each campaign
 *
 * `Pacing.dailyCap` is per campaign, and it was the only brake there was. Two
 * campaigns on the same day each spent their own 200; the «الكتاب اتشحن»
 * notice spent outside any campaign at all; and every new automatic sender
 * would have been one more budget nobody added up. WhatsApp does not see
 * campaigns. It sees one number and how many strangers it messaged today.
 *
 * ## Why it ramps
 *
 * A brand-new number has no chat history, so every message it sends starts a
 * new chat — and a new number that starts a hundred new chats on its first
 * day is the textbook pattern WhatsApp restricts (the reach-out timelock, nack
 * 463) or bans. Numbers that survive are warmed up: a few dozen a day, then
 * more as people reply and the account accumulates trusted chats.
 *
 * The day counts from the FIRST message this number ever sent through the
 * platform (`whatsapp_sends.from_phone`), so linking a different number starts
 * the ramp again from day 0 — which is exactly when it is needed.
 *
 * Test sends («رسالة تجربة») count toward the total but are never refused by
 * it: one message the operator typed by hand is how he finds out whether the
 * number works at all, and refusing it would hide the answer.
 */
export const DEVICE_WARMUP: ReadonlyArray<{ fromDay: number; limit: number }> = [
  { fromDay: 0, limit: 40 },
  { fromDay: 3, limit: 80 },
  { fromDay: 7, limit: 150 },
  { fromDay: 14, limit: 250 },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole Cairo calendar days from `first` to `now` — 0 on the first day. */
export function warmupDay(first: Date | null, now: Date): number {
  if (!first) return 0;
  const a = cairoParts(first);
  const b = cairoParts(now);
  const days = Math.round(
    (Date.UTC(b.year, b.month - 1, b.date) - Date.UTC(a.year, a.month - 1, a.date)) / DAY_MS,
  );
  return Math.max(0, days);
}

export interface DeviceCeiling {
  /** Messages allowed today, all senders together. */
  limit: number;
  /** 0-based day of the number's ramp. */
  day: number;
  /** Whether the ramp is still climbing — the device page says so. */
  warmingUp: boolean;
}

export function deviceCeiling(firstSendAt: Date | null, now: Date): DeviceCeiling {
  const day = warmupDay(firstSendAt, now);
  let limit = DEVICE_WARMUP[0]!.limit;
  for (const step of DEVICE_WARMUP) if (day >= step.fromDay) limit = step.limit;
  const last = DEVICE_WARMUP[DEVICE_WARMUP.length - 1]!;
  return { limit, day, warmingUp: day < last.fromDay };
}

/** The `YYYY-MM-DD` the ceiling is counted against, and when that day began. */
export function cairoDayStart(now: Date): Date {
  const p = cairoParts(now);
  return fromCairoWall(p.year, p.month, p.date, 0);
}

/**
 * When a sender that hit the ceiling may try again: the start of tomorrow's
 * sending window, Cairo — not midnight, which is outside every window.
 */
export function ceilingResumesAt(now: Date, pacing: Pick<Pacing, 'windowStartHour'>): Date {
  const p = cairoParts(now);
  const tomorrow = new Date(Date.UTC(p.year, p.month - 1, p.date + 1));
  return fromCairoWall(
    tomorrow.getUTCFullYear(),
    tomorrow.getUTCMonth() + 1,
    tomorrow.getUTCDate(),
    pacing.windowStartHour,
  );
}
