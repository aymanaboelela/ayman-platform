import { z } from '@ayman/contracts/zod';
import {
  cairoParts,
  fromCairoWall,
  maySendAt,
  rolled,
  withinWindow,
  type Pacing,
  type RunState,
} from '@ayman/contracts/marketing/pacing';

/**
 * «احفظهم في واتساب» — every student into the linked number's own WhatsApp
 * contact list (NOT the phone's address book), so the instructor's Status
 * reaches the students who already saved him.
 *
 * ## What is known and what is not
 *
 * Proven: Baileys 7 writes a `contactAction` app-state patch with
 * `saveOnPrimaryAddressbook: false` — WhatsApp's own «Sync contact to phone»
 * switch — and that patch is what WhatsApp Web sends when a contact is added
 * from the keyboard. NOT proven: that WhatsApp counts a contact saved that
 * way for Status' «جهات اتصالي». It is a contact in every screen of the app,
 * so it very probably does, and the five-contact trial below exists to find
 * out on a real phone before four thousand are written.
 *
 * ## Why it is paced at all, when nothing is sent
 *
 * Nobody receives anything and nobody is notified. But every contact is one
 * existence lookup plus one app-state write from a linked device, and an
 * account that writes four thousand of either in an hour is not one WhatsApp
 * has seen a person be. No ban from this has been reported anywhere we could
 * find; no safe rate has been published either. So the same brakes as a
 * campaign, a little gentler than one: a person adding classmates one by one
 * on WhatsApp Web, with breaks, during the day.
 */

export const WA_CONTACTS_PACING: Pacing = {
  minDelaySeconds: 30,
  maxDelaySeconds: 75,
  batchSize: 20,
  batchPauseMinutes: 15,
  dailyCap: 150,
  windowStartHour: 10,
  windowEndHour: 22,
};

/** «جرّب على ٥ الأول» — the first real-world run, before the whole list. */
export const WA_CONTACTS_TRIAL = 5;

/** One contact is retried on later runs at most this many times in total. */
export const WA_CONTACTS_MAX_ATTEMPTS = 3;

export const WA_CONTACT_STATUSES = ['pending', 'saved', 'not_on_whatsapp', 'failed', 'skipped'] as const;
export type WaContactStatus = (typeof WA_CONTACT_STATUSES)[number];

export const WA_CONTACTS_STATES = ['idle', 'running', 'paused', 'done'] as const;
export type WaContactsState = (typeof WA_CONTACTS_STATES)[number];

/**
 * Why a run stopped. A code, not a sentence: the screen owns the Arabic
 * (`copy/wa-contacts.ts`), and the runner must not be able to invent a
 * reason the screen has no words for.
 *
 *   · `manual`     — «وقّف» was pressed;
 *   · `limit`      — the run's own limit was reached (the five-contact trial);
 *   · `device`     — the linked number is not connected;
 *   · `restricted` — WhatsApp has this account under a reach-out timelock;
 *   · `error`      — anything else WhatsApp or the sidecar said. Always a stop:
 *                    the first refusal is a signal, not a row to skip past.
 */
export const WA_CONTACTS_PAUSE_CODES = ['manual', 'limit', 'device', 'restricted', 'error'] as const;
export type WaContactsPauseCode = (typeof WA_CONTACTS_PAUSE_CODES)[number];

export const WaContactsStartSchema = z
  .object({
    /** `null` is the whole list. Anything else stops the run after that many saves. */
    limit: z.number().int().min(1).max(100_000).nullable(),
  })
  .strict();
export type WaContactsStart = z.infer<typeof WaContactsStartSchema>;

export const WaContactsStatusSchema = z.object({
  state: z.enum(WA_CONTACTS_STATES),
  pauseCode: z.enum(WA_CONTACTS_PAUSE_CODES).nullable(),
  /** WhatsApp's or the sidecar's own words for the last error, for the operator. */
  lastError: z.string().nullable(),
  runLimit: z.number().int().nullable(),
  savedThisRun: z.number().int(),
  savedToday: z.number().int(),
  dailyCap: z.number().int(),
  nextAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  lastSavedAt: z.string().nullable(),
  /** Whether the linked number is connected right now. */
  deviceConnected: z.boolean(),
  /** Students with a number on file — what «الكل» would queue. */
  studentsWithPhone: z.number().int(),
  counts: z.object({
    pending: z.number().int(),
    saved: z.number().int(),
    notOnWhatsapp: z.number().int(),
    failed: z.number().int(),
    skipped: z.number().int(),
  }),
  /** Rough minutes left at the pacing above, overnight gaps included. */
  estimateMinutes: z.number().int(),
});
export type WaContactsStatus = z.infer<typeof WaContactsStatusSchema>;

/**
 * When the next contact may be written, if not now — `null` when it may.
 *
 * Outside the window → the window's next opening. Today's cap spent →
 * tomorrow's opening. The runner stores the answer as `next_at`, so a
 * redeploy cannot reset a wait to zero.
 */
export function waitUntil(now: Date, pacing: Pacing, state: RunState): Date | null {
  if (maySendAt(now, pacing, state)) return null;
  const counted = rolled(state, now);
  if (counted.sentToday >= pacing.dailyCap) {
    const p = cairoParts(now);
    const tomorrow = new Date(Date.UTC(p.year, p.month - 1, p.date + 1));
    return fromCairoWall(
      tomorrow.getUTCFullYear(),
      tomorrow.getUTCMonth() + 1,
      tomorrow.getUTCDate(),
      pacing.windowStartHour,
    );
  }
  return withinWindow(now, pacing);
}

/**
 * Whether a run with this limit has done its share. `null` never is.
 */
export function runLimitReached(runLimit: number | null, savedThisRun: number): boolean {
  return runLimit !== null && savedThisRun >= runLimit;
}
