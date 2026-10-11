/**
 * ── Which rung a lecture opens on ────────────────────────────────────────
 *
 * Every lecture opens on the lightest rung (`HLS_CONFIG.startLevel: 0`): on a
 * weak line that is what gets a picture up in seconds instead of half a
 * minute. The price is paid on a GOOD line — one segment, six seconds, of a
 * soft 360p before hls.js climbs. YouTube does not make a student it already
 * knows sit through that, and neither does this:
 *
 *   · the browser's hint (`navigator.connection.downlink`, Chrome and
 *     Android) — about the line the student is on NOW;
 *   · lowered, never raised, by what this player measured here last time;
 *   · no hint → the lightest rung, exactly as before.
 *
 * The rung is the tallest whose FIRST segment arrives within
 * `FIRST_SEGMENT_BUDGET_S` at that bandwidth — not the tallest the line can
 * sustain. Measured in Chrome at 3 Mbit/s: opening on 720 put the first frame
 * at 4.3 s, opening on 360 at 1.3 s. The first frame is what a student waits
 * on; the climb after it is free.
 */
const KEY = 'ayman:player:bandwidth';

/** A measurement older than this is about a different line — a café, a train, a relative's house. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Our segments are cut at six seconds (`SEGMENT_SECONDS` in the encoder). */
const SEGMENT_SECONDS = 6;

/** How long the first segment may take to arrive. */
const FIRST_SEGMENT_BUDGET_S = 1.5;

interface Saved {
  bps: number;
  at: number;
}

export function readSavedBandwidth(now = Date.now()): number | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null;
    if (parsed === null || typeof parsed.bps !== 'number' || typeof parsed.at !== 'number') return null;
    if (!Number.isFinite(parsed.bps) || parsed.bps <= 0) return null;
    if (now - parsed.at > MAX_AGE_MS || parsed.at > now + 60_000) return null;
    return parsed.bps;
  } catch {
    // Private window, storage switched off, or a value somebody else wrote.
    return null;
  }
}

/** Remember what the player measured. A NaN or a zero (nothing timed yet) is not a measurement. */
export function saveBandwidth(bps: number, now = Date.now()): void {
  if (!Number.isFinite(bps) || bps <= 0) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ bps: Math.round(bps), at: now }));
  } catch {
    /* private window — the next lecture opens on the lightest rung, as it always did */
  }
}

/**
 * The line's speed in bit/s — or `null`, which opens on the lightest rung.
 *
 * The browser's hint is REQUIRED. It is the only fact about the line the
 * student is on now; without it (Safari, Firefox — every iPhone) a saved
 * measurement could be from home Wi-Fi while the student sits on 3G, and
 * nothing would say so. A measurement is also easily too high: segments
 * replayed from the cache arrive instantly and hls.js times them anyway
 * (measured: 218 Mbit/s on a second visit). So the saved number may only
 * LOWER the hint, never raise it.
 */
export function knownBandwidth(
  connection: { downlink?: number } | undefined = (
    globalThis.navigator as (Navigator & { connection?: { downlink?: number } }) | undefined
  )?.connection,
  now = Date.now(),
): number | null {
  // Mbit/s, rounded to 25 kbit/s steps; 0 means «unknown». Chrome caps it at 10.
  if (connection?.downlink === undefined || !(connection.downlink > 0)) return null;
  const hint = connection.downlink * 1_000_000;
  const saved = readSavedBandwidth(now);
  return saved === null ? hint : Math.min(saved, hint);
}

/**
 * The tallest rung worth opening on for a player this many device pixels
 * wide: the first one at least as wide, the way hls.js's own
 * `capLevelToPlayerSize` picks — so a phone in portrait never opens on 1080.
 *
 * Measured here, from the element, because hls.js's own cap is not ready yet
 * when the start rung has to be chosen: it read 0 at manifest-parsed, and
 * every lecture opened on 360 regardless of the line.
 */
export function capForWidth(levels: ReadonlyArray<{ width?: number }>, playerPixels: number): number {
  if (!(playerPixels > 0)) return levels.length - 1;
  const index = levels.findIndex((level) => (level.width ?? 0) >= playerPixels);
  return index === -1 ? levels.length - 1 : index;
}

/**
 * The index (hls.js order: lightest first) of the rung to open on.
 *
 * `averageBitrate` when the master says it — what a segment actually weighs —
 * and the declared peak otherwise. `cap` is from `capForWidth`.
 */
export function startRung(
  levels: ReadonlyArray<{ bitrate: number; averageBitrate?: number }>,
  bandwidth: number | null,
  cap = -1,
): number {
  if (bandwidth === null || bandwidth <= 0 || levels.length === 0) return 0;
  let pick = 0;
  levels.forEach((level, index) => {
    const weight = level.averageBitrate && level.averageBitrate > 0 ? level.averageBitrate : level.bitrate;
    if ((weight * SEGMENT_SECONDS) / bandwidth <= FIRST_SEGMENT_BUDGET_S) pick = index;
  });
  return cap >= 0 ? Math.min(pick, cap) : pick;
}
