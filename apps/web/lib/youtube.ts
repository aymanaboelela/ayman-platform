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
}

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
    // The API calls this global exactly once, whoever ends up loading it.
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('the YouTube IFrame API loaded without a Player constructor'));
    };

    const script = document.createElement('script');
    script.src = API_SRC;
    script.async = true;
    script.onerror = () => {
      // Let a later attempt retry rather than caching the failure forever —
      // this fires on a flaky connection as readily as on a blocked domain.
      pending = null;
      reject(new Error('failed to load the YouTube IFrame API'));
    };
    document.head.append(script);
  });

  return pending;
}

/**
 * §7 P3: the database stores the 11-char id, never a URL, and the embed is
 * reconstructed here. `youtube-nocookie.com` is passed as the API `host` so
 * the player itself is served from the no-cookie domain.
 */
export const YOUTUBE_NOCOOKIE_HOST = 'https://www.youtube-nocookie.com';
