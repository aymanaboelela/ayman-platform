/**
 * What to do when the socket closes, and how long to wait before trying again.
 *
 * ## Why this is not "reconnect after 5s, always" any more
 *
 * That was the whole policy, for every close code, forever. Two of the codes
 * it was applied to cannot be fixed by trying again, and trying again is not
 * free on a number WhatsApp is already watching:
 *
 *   · **403 `forbidden`** — WhatsApp has banned or locked the account. Every
 *     reconnect is refused identically, and a client hammering a banned
 *     account every five seconds for days is the opposite of the quiet
 *     behaviour that gets a ban reviewed. The device page has to SAY this
 *     instead of showing «مفيش رقم متربط» next to a button that will never
 *     work.
 *   · **a flapping network** — a fixed 5s beat turns an hour-long outage into
 *     seven hundred handshakes. Exponential backoff, capped, reset on `open`.
 *
 * And one code that should not wait at all: **515 `restartRequired`** is what
 * WhatsApp sends immediately after a QR is scanned — the pairing succeeded and
 * the server wants a fresh connection with the new credentials. Waiting 5s
 * there made the screen fall back to «مفيش رقم متربط» for five seconds right
 * after a successful scan, which reads exactly like the scan failed.
 *
 * Pure — no timers, no socket — so every branch is unit-tested.
 */

/** The `DisconnectReason` values from Baileys, restated so this file stays pure. */
export const CLOSE = {
  loggedOut: 401,
  forbidden: 403,
  timedOut: 408,
  multideviceMismatch: 411,
  connectionClosed: 428,
  connectionReplaced: 440,
  badSession: 500,
  unavailableService: 503,
  restartRequired: 515,
};

/**
 * @param {number | undefined} status  `lastDisconnect.error.output.statusCode`
 * @returns {{ action: 'reconnect' | 'reconnect-now' | 'clear-and-wait' | 'stop', detail: string }}
 *   `detail` is the short English reason the device page renders verbatim
 *   beside its Arabic label — the code is what somebody will search for.
 */
export function classifyClose(status) {
  switch (status) {
    case CLOSE.loggedOut:
      // The phone (or WhatsApp) revoked this linked device. The stored
      // credentials are dead and replaying them closes 401 again before a QR
      // can ever be issued — see `auth-store.mjs`.
      return { action: 'clear-and-wait', detail: 'closed: 401 (logged out — the phone removed this device)' };
    case CLOSE.forbidden:
      return { action: 'stop', detail: 'closed: 403 (WhatsApp refused this account — banned or locked)' };
    case CLOSE.multideviceMismatch:
      // The saved session belongs to a protocol state the server no longer
      // accepts. Only a fresh pairing fixes it — but the credentials are NOT
      // wiped automatically: unlike 401 nothing revoked them, and a wipe on a
      // misread code would cost a working number its pairing. The operator's
      // «امسح البيانات وابدأ من الأول» is one click away.
      return { action: 'stop', detail: 'closed: 411 (session no longer valid — link again)' };
    case CLOSE.restartRequired:
      return { action: 'reconnect-now', detail: 'closed: 515 (restart after pairing)' };
    case CLOSE.connectionReplaced:
      // Another process opened the SAME session. Reconnecting immediately
      // starts a tug-of-war that ends with WhatsApp logging both out, so this
      // one backs off like any transient failure — never faster.
      return { action: 'reconnect', detail: 'closed: 440 (the same session was opened somewhere else)' };
    default:
      return { action: 'reconnect', detail: status ? `closed: ${status}` : 'closed' };
  }
}

/**
 * Exponential backoff with a ceiling. `next()` is the delay before the next
 * attempt; `reset()` on every successful `open`.
 */
export class Backoff {
  #baseMs;
  #maxMs;
  #failures = 0;

  /**
   * @param {number} [baseMs] first delay — the old fixed beat, so a single
   *   blip reconnects exactly as fast as it always did
   * @param {number} [maxMs] five minutes: long enough that an outage costs a
   *   dozen handshakes an hour, short enough that recovery is not noticed late
   */
  constructor(baseMs = 5_000, maxMs = 300_000) {
    this.#baseMs = baseMs;
    this.#maxMs = maxMs;
  }

  next() {
    const delay = Math.min(this.#maxMs, this.#baseMs * 2 ** this.#failures);
    this.#failures += 1;
    return delay;
  }

  reset() {
    this.#failures = 0;
  }

  get failures() {
    return this.#failures;
  }
}
