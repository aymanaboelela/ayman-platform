import { loadYouTubeIframeApi, YOUTUBE_NOCOOKIE_HOST } from '@/lib/youtube';

/**
 * How long a YouTube video is, asked of YouTube.
 *
 * ## Why the player and not an API
 *
 * There are three ways to learn a video's length and only one of them is
 * available here:
 *
 * · **Data API v3** returns it directly and needs a Google API key. There is no
 *   key in this project, and adding one means a secret to rotate, a quota to
 *   watch and a per-save server round trip — for a number the browser can read
 *   for free.
 * · **oEmbed** is keyless and public, and returns title, author and thumbnail.
 *   It does NOT return duration. This was the obvious candidate and it simply
 *   cannot answer the question.
 * · **The IFrame player** reports `getDuration()` once it is ready. It is the
 *   same API the student's player already uses, the host is already in
 *   `frame-src`, and the script host is already in `script-src` — so this adds
 *   no new origin to the CSP.
 *
 * ## What it costs
 *
 * A hidden 1×1 iframe, created on demand and destroyed the moment the number is
 * read. It is never mounted while the admin is merely typing — the caller waits
 * for a complete 11-character id first.
 *
 * ## Why it can return null
 *
 * A private, deleted, region-blocked or embedding-disabled video answers with
 * an error or never becomes ready. That is a real state, not an exception: the
 * duration field stays exactly as the instructor left it and they can type the
 * number, which is what they did before this existed. Failing loudly would be
 * worse — the video may be perfectly fine and merely un-embeddable, and the
 * lesson still needs saving.
 */
export async function fetchYouTubeDuration(
  videoId: string,
  { timeoutMs = 8000 }: { timeoutMs?: number } = {},
): Promise<number | null> {
  const api = await loadYouTubeIframeApi().catch(() => null);
  if (!api) return null;

  const host = document.createElement('div');
  // Off-screen rather than `display: none`: a hidden iframe is allowed not to
  // load at all in some engines, and this one has to actually initialise.
  host.style.cssText = 'position:fixed;inset-block-start:-9999px;inline-size:1px;block-size:1px;';
  document.body.append(host);

  return new Promise<number | null>((resolve) => {
    let settled = false;
    let player: { destroy(): void; getDuration(): number } | null = null;

    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        player?.destroy();
      } catch {
        // The player can already be gone if YouTube tore the frame down first;
        // the DOM node below is removed either way.
      }
      host.remove();
      resolve(value);
    };

    // A video that never becomes ready must not leave the field spinning
    // forever — see the docblock on why this resolves rather than rejects.
    const timer = setTimeout(() => done(null), timeoutMs);

    try {
      player = new api.Player(host, {
        videoId,
        host: YOUTUBE_NOCOOKIE_HOST,
        playerVars: { autoplay: 0, controls: 0 },
        events: {
          onReady: (event) => {
            const seconds = event.target.getDuration();
            // 0 is what a live stream and a still-loading player both report,
            // and neither is a duration worth writing into the field.
            done(Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null);
          },
          onError: () => done(null),
        },
      });
    } catch {
      done(null);
    }
  });
}
