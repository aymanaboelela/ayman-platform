/**
 * Detects a Baileys handshake that has stopped making progress.
 *
 * A real handshake reaches `open` or `close` within a few seconds. Waiting
 * on a human to scan a QR is not "slow" even if it takes minutes — Baileys
 * reissues `update.qr` roughly every 20s while nobody has scanned yet, and
 * every reissue counts as progress. So this is not a fixed clock started
 * once at `connect()` and raced against; every sign of life (`touch()`)
 * pushes the deadline back. It only ever fires when NOTHING has happened at
 * all for `timeoutMs` — no `open`, no `close`, not even a QR refresh — which
 * is exactly the 2026-08-27 symptom: `connecting` left permanently non-null
 * by a process killed mid-handshake, with every later `/link` click
 * returning that same stale, going-nowhere promise.
 *
 * Pure and clock-injectable on purpose: nothing here touches a real timer,
 * so the logic is unit-testable without a live Baileys socket.
 */
export class ConnectWatchdog {
  #timeoutMs;
  #now;
  #deadline = null;

  constructor(timeoutMs, now = Date.now) {
    this.#timeoutMs = timeoutMs;
    this.#now = now;
  }

  /** Call when an attempt starts, and again on every `connection.update`,
   *  however small — proof the handshake is still alive. */
  touch() {
    this.#deadline = this.#now() + this.#timeoutMs;
  }

  /** Call once the attempt reaches a terminal state (`open` or `close`) —
   *  there is nothing left to watch until the next attempt. */
  disarm() {
    this.#deadline = null;
  }

  /** Whether an attempt is currently being watched at all. */
  get armed() {
    return this.#deadline !== null;
  }

  /** True once `timeoutMs` has passed since the last `touch()` with no
   *  `disarm()` in between — the signal to reset the stuck attempt. */
  isStuck() {
    return this.#deadline !== null && this.#now() >= this.#deadline;
  }

  /**
   * True once the attempt has been stuck for `graceMs` *beyond* the normal
   * timeout — i.e. even the module's own recovery (which polls `isStuck()`
   * on its own short interval) should already have reset it and hasn't.
   * Meant for a healthcheck: a much wider margin than `isStuck()` so a
   * container is only ever flagged unhealthy for a genuinely broken
   * recovery path, never for an ordinary handshake or brief reconnect.
   */
  overdueBy(graceMs) {
    return this.#deadline !== null && this.#now() >= this.#deadline + graceMs;
  }
}
