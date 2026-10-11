/**
 * ── «تابلت الوزارة مش بيشغّل يوتيوب» ──────────────────────────────────────
 *
 * Two different networks look identical from inside the player, and they need
 * opposite answers:
 *
 *   · one drops `youtube.com/iframe_api` — an ad blocker, a filtering DNS — and
 *     YouTube itself is fine. The plain embed plays there (`video-lesson.tsx`).
 *   · one drops YouTube outright — the ministry tablet, some school networks.
 *     The plain embed is a dark box there, and so is every other door into
 *     YouTube. The only honest answer is «من الموبايل أو اللابتوب».
 *
 * Neither reports anything (see `video-player-fails-silently`), so the player
 * asks YouTube's two hosts for something tiny and public — the video's own
 * 120×90 thumbnail and youtube.com's icon — as images, which need nothing but
 * the network. Both arrive: YouTube is reachable. Either fails or never
 * answers: it is not, and no embed is going to change that.
 *
 * Both, not one: a filter can carry `youtube.com` and leave the thumbnail
 * host alone, and it is the video host that decides whether anything plays.
 */
export type YouTubeReach = 'ok' | 'blocked';

/** Long enough for a few kilobytes on a slow 3G line; a block that hangs is still a block. */
export const PROBE_TIMEOUT_MS = 8_000;

type ImageLoader = (url: string, timeoutMs: number) => Promise<boolean>;

/** `true` once the image has actually decoded; `false` on an error, a non-image answer, or silence. */
export const loadImage: ImageLoader = (url, timeoutMs) =>
  new Promise<boolean>((resolve) => {
    const image = new Image();
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(ok);
    };
    // A filter that answers with its own HTML page is an `onerror`, not a load:
    // the browser cannot decode a page as an image.
    image.onload = () => done(image.naturalWidth > 0);
    image.onerror = () => done(false);
    const timer = setTimeout(() => done(false), timeoutMs);
    image.src = url;
  });

export function probeYouTube(
  youtubeId: string,
  { timeoutMs = PROBE_TIMEOUT_MS, load = loadImage }: { timeoutMs?: number; load?: ImageLoader } = {},
): Promise<YouTubeReach> {
  const hosts = [`https://i.ytimg.com/vi/${encodeURIComponent(youtubeId)}/default.jpg`, 'https://www.youtube.com/favicon.ico'];
  return Promise.all(hosts.map((url) => load(url, timeoutMs).catch(() => false))).then((loaded) =>
    loaded.every(Boolean) ? 'ok' : 'blocked',
  );
}
