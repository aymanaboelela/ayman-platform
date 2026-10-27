/**
 * Resolves to `fallback` if `promise` has not settled within `ms`, and to
 * `fallback` if it rejects.
 *
 * For the network calls on the connect path that have no timeout of their own.
 * `fetchLatestBaileysVersion` is a plain `fetch` of a file on GitHub with no
 * signal: a GitHub that answers slowly used to hold `connect()` until the
 * watchdog killed it, and then the next attempt waited on the same fetch — a
 * sidecar that could not connect for a reason that had nothing to do with
 * WhatsApp. The library ships a version of its own, so "no answer in a few
 * seconds" has a perfectly good fallback.
 *
 * @template T, F
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {F} fallback
 * @returns {Promise<T | F>}
 */
export function withTimeout(promise, ms, fallback) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([Promise.resolve(promise).catch(() => fallback), timeout]).finally(() =>
    clearTimeout(timer),
  );
}
