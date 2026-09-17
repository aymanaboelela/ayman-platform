/**
 * A hand-written slice of the YouTube IFrame Player API instead of a typings
 * package: this is the entire surface we use, it is stable, and a dependency
 * whose whole job is to describe six methods is not worth the supply chain.
 */
export const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

export interface YouTubePlayer {
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
  /**
   * Start playback.
   *
   * Constructing a player does NOT start one — it builds the frame and leaves
   * it cued, showing YouTube's own poster and its own play button. The student
   * has already pressed play by the time this exists (that press is what builds
   * it), so `video-lesson.tsx` calls this from `onReady` rather than making
   * them press a second, different button inside a frame they did not ask to
   * see. See the note there.
   */
  playVideo(): void;
  /**
   * The `<iframe>` the API built for us.
   *
   * Optional because it is the one method here that is not on every version of
   * the API, and the caller ( `video-lesson.tsx`, granting fullscreen) treats
   * its absence as "nothing to grant" rather than as an error.
   */
  getIframe?(): HTMLIFrameElement | null;
}

/**
 * What the player's frame is allowed to do.
 *
 * `fullscreen` is the load-bearing entry — see `video-lesson.tsx`'s `onReady`.
 * The rest are the capabilities YouTube's own embed code requests, minus
 * `clipboard-write` and `web-share`, which this player has no use for.
 */
export const FRAME_ALLOW =
  'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen';

export interface YouTubePlayerOptions {
  videoId: string;
  host?: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (event: { target: YouTubePlayer }) => void;
    onStateChange?: (event: { data: number; target: YouTubePlayer }) => void;
    onError?: (event: { data: number }) => void;
  };
}

export interface YouTubeApi {
  Player: new (element: HTMLElement | string, options: YouTubePlayerOptions) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const API_SRC = 'https://www.youtube.com/iframe_api';

/**
 * How long to wait for the API to announce itself before calling it blocked.
 *
 * `script.onerror` is NOT enough on its own, and that gap is what this number
 * closes. It fires for a refused connection or a DNS miss — but a network
 * that answers with something ELSE (a carrier's captive portal, a data bundle
 * that serves its own "buy more data" page, a filtering proxy returning HTML
 * with a 200) delivers a script that parses fine and never calls
 * `onYouTubeIframeAPIReady`. The promise then never settles, `await` in the
 * player's activate handler hangs forever, and the student is left looking at
 * an empty grey box with the poster already gone and no message on it —
 * reported from a tablet whose only fix was a VPN.
 *
 * Twelve seconds: long enough that a genuinely slow 3G fetch of ~60kB still
 * wins, short enough that a blocked one does not read as a broken site.
 */
const API_READY_TIMEOUT_MS = 12_000;

/** Module-level so the script is requested at most once per document. */
let pending: Promise<YouTubeApi> | null = null;

/**
 * Loads the IFrame API on demand — never on page load.
 *
 * The script is ~60kB and only matters once a student presses play, so the
 * player renders a static facade first and calls this from the click handler.
 * That keeps it off the critical path entirely: no third-party request, no
 * main-thread work, and nothing that could shift layout, before the user has
 * asked for a video.
 *
 * CSP note: `strict-dynamic` propagates the trust of the nonce'd bundle that
 * injects this tag, so no `script-src` host entry is needed (and adding one
 * would be a silent no-op). `frame-src` is a different story and DOES need
 * the nocookie host — see `proxy.ts`.
 */
export function loadYouTubeIframeApi(): Promise<YouTubeApi> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('the YouTube IFrame API is browser-only'));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (pending) return pending;

  pending = new Promise<YouTubeApi>((resolve, reject) => {
    // Every exit below goes through one of these two, so the timer is always
    // cleared and `pending` is always released on failure — a cached rejected
    // promise would make «نجرّب تاني» a button that can never succeed.
    // A holder rather than a bare `let`, because both closures below capture
    // the timer BEFORE it is armed a few lines further down.
    const timer: { id?: ReturnType<typeof setTimeout> } = {};
    const succeed = (api: YouTubeApi) => {
      clearTimeout(timer.id);
      resolve(api);
    };
    const fail = (message: string) => {
      clearTimeout(timer.id);
      pending = null;
      reject(new Error(message));
    };

    // The API calls this global exactly once, whoever ends up loading it.
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) succeed(window.YT);
      else fail('the YouTube IFrame API loaded without a Player constructor');
    };

    const script = document.createElement('script');
    script.src = API_SRC;
    script.async = true;
    script.onerror = () => {
      // Fires on a flaky connection as readily as on a blocked domain, so the
      // retry has to stay open — hence `fail` clearing `pending`.
      fail('failed to load the YouTube IFrame API');
    };
    document.head.append(script);

    // The silent case: the request was answered, but by something that is not
    // the API. See `API_READY_TIMEOUT_MS`.
    timer.id = setTimeout(() => fail('the YouTube IFrame API never became ready'), API_READY_TIMEOUT_MS);
  });

  return pending;
}

/**
 * §7 P3: the database stores the 11-char id, never a URL, and the embed is
 * reconstructed here. `youtube-nocookie.com` is passed as the API `host` so
 * the player itself is served from the no-cookie domain.
 */
export const YOUTUBE_NOCOOKIE_HOST = 'https://www.youtube-nocookie.com';
