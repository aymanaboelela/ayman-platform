import { loadYouTubeIframeApi } from '@/lib/youtube';

/**
 * ── «لما أضغط عليها بيطول عشان يحمّل» ────────────────────────────────────
 *
 * Nothing used to start until the poster was tapped, and then it all ran in a
 * line: the player library, the master playlist, the rung's playlist, the key,
 * the first segment. On a fast connection that is still four or five round
 * trips one behind the other, and the student watches a black frame for every
 * one of them (2026-10-11: «النت حلو جدًا وبرضه بيطول»).
 *
 * So the parts that cost bytes worth spending are fetched while the poster is
 * still on screen, and the tap finds them already in the cache:
 *
 *   · our copy: the player library (cached for every other lesson too), the
 *     master playlist, and the playlists of the light rungs the player may
 *     open with;
 *   · YouTube: its IFrame API script.
 *
 * Deliberately NOT here: a single segment. A lesson page someone only scrolls
 * past must not spend their data bundle on video — the playlists are tens of
 * kilobytes, a segment is megabytes. The key is not here either: it is fetched
 * with the student's session and is not cacheable.
 */

/**
 * Rungs worth warming: every one light enough to open on — up to 3 Mbit/s —
 * or, when none is (a lecture published as it is has one 1080 rung of ~5), the
 * lightest there is.
 *
 * Not «the one the player will pick». It picks by the estimate AND by how big
 * the video element is, so a guess is wrong as often as it is right (measured:
 * the guess said 720, the player opened 360). A playlist is tens of kilobytes;
 * warming three of them costs less than one segment, and the ones above the
 * line — the heaviest playlists, which only a fast line climbs to — are left
 * for when the player asks.
 */
const WARM_UP_TO_BPS = 3_000_000;

/** Playlist URIs with their declared bandwidth, in the order a master lists them. */
export function masterRungs(master: string): Array<{ uri: string; bandwidth: number }> {
  const rungs: Array<{ uri: string; bandwidth: number }> = [];
  const lines = master.split('\n').map((line) => line.trim());
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;
    // `(?<=[:,])` — `AVERAGE-BANDWIDTH` ends in `BANDWIDTH` too.
    const bandwidth = Number(/(?<=[:,])BANDWIDTH=(\d+)/.exec(line)?.[1] ?? Number.NaN);
    const uri = lines.slice(i + 1).find((next) => next !== '' && !next.startsWith('#'));
    if (uri !== undefined && Number.isFinite(bandwidth)) rungs.push({ uri, bandwidth });
  }
  return rungs;
}

/** The playlists to fetch ahead of the tap — see `WARM_UP_TO_BPS`. */
export function warmRungs(master: string): string[] {
  const rungs = masterRungs(master);
  if (rungs.length === 0) return [];
  const light = rungs.filter((rung) => rung.bandwidth <= WARM_UP_TO_BPS);
  const pool = light.length > 0 ? light : [rungs.reduce((a, b) => (b.bandwidth < a.bandwidth ? b : a))];
  return pool.map((rung) => rung.uri);
}

interface ConnectionHints {
  saveData?: boolean;
  effectiveType?: string;
}

/** Not on a data-saver connection, and not on one that is already crawling. */
export function mayPrewarm(connection: ConnectionHints | undefined): boolean {
  if (connection === undefined) return true;
  if (connection.saveData === true) return false;
  return connection.effectiveType !== 'slow-2g' && connection.effectiveType !== '2g';
}

/** Library + master + the light rungs' playlists. Every failure is swallowed: this is a head start, not a dependency. */
export async function prewarmMirror(hlsUrl: string, fetcher: typeof fetch = fetch): Promise<void> {
  void import('hls.js').catch(() => undefined);
  try {
    const response = await fetcher(hlsUrl);
    if (!response.ok) return;
    const uris = warmRungs(await response.text());
    // Same URL resolution the player does: relative to the master, query and all.
    await Promise.all(uris.map((uri) => fetcher(new URL(uri, hlsUrl).toString()).catch(() => undefined)));
  } catch {
    // Offline, blocked, or the lecture is being replaced — the tap will find out.
  }
}

/** YouTube's own script. `loadYouTubeIframeApi` is retry-safe, so a failed head start does not stick. */
export function prewarmYouTube(): void {
  try {
    void Promise.resolve(loadYouTubeIframeApi()).catch(() => undefined);
  } catch {
    // Browser-only API called where there is no window.
  }
}

/** Run `task` once the page has settled, so the head start never competes with the first paint. */
export function whenIdle(task: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(task, { timeout: 2_000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(task, 400);
  return () => clearTimeout(id);
}
