/**
 * Waits for a pairing attempt to produce something worth answering with.
 *
 * `connect()` resolves as soon as the Baileys socket OBJECT exists, which is
 * well before WhatsApp has issued a code — that arrives later, on
 * `connection.update`, and is then rendered to a data URL asynchronously. A
 * `POST /link` that answered at the first moment handed the admin screen the
 * pre-click state (`disconnected`, `qr: null`), so the button read as dead
 * and the code only surfaced whenever the next status poll happened to land.
 *
 * Extracted and clock-injected for the same reason `ConnectWatchdog` is:
 * nothing here touches a real timer or a live socket, so the one piece of
 * logic that decides whether the button feels broken can be tested without
 * either.
 */

/**
 * @param {() => { qr: unknown, state: string }} read  current sidecar state
 * @param {object} [deps]
 * @param {() => number} [deps.now]
 * @param {(ms: number) => Promise<void>} [deps.sleep]
 * @param {number} [deps.timeoutMs]
 * @param {number} [deps.pollMs]
 * @returns {Promise<'qr' | 'connected' | 'timeout'>} why the wait ended —
 *   returned for the caller's logs and for tests; the route answers with the
 *   live state either way.
 */
export async function waitForLinkProgress(read, deps = {}) {
  const {
    now = Date.now,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    timeoutMs = 10_000,
    pollMs = 250,
  } = deps;

  const deadline = now() + timeoutMs;

  for (;;) {
    // Checked BEFORE the first sleep: an attempt that already has a code —
    // a second click while the QR is on screen — must not be made to wait
    // for one it already has.
    const { qr, state } = read();
    if (qr) return 'qr';
    if (state === 'connected') return 'connected';
    if (now() >= deadline) return 'timeout';
    await sleep(pollMs);
  }
}
