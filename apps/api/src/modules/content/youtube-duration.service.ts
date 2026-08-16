import { Injectable, Logger } from '@nestjs/common';
import { YOUTUBE_ID_RE, type VideoEmbedStatus } from '@ayman/contracts/video';

/** YouTube caps uploads at 12 hours, and so does `LessonVideoInputSchema`. */
const MAX_SECONDS = 12 * 60 * 60;

/**
 * What the WATCH PAGE alone can say about embedding — which is less than it
 * first appears, and reading it as more is how this accused a working video.
 *
 * ⚠️ `LOGIN_REQUIRED` is NOT a verdict on the video.
 *
 * It is what YouTube answers a datacenter IP it has decided to challenge —
 * «Sign in to confirm you're not a bot» — and it is also what it answers for a
 * genuinely private video. From a VPS the two are indistinguishable. The first
 * version of this mapped every non-`OK` status to `unavailable`, and the result
 * shipped: Ayman pasted a public, embeddable, 48-minute lecture of his own and
 * the panel told him YouTube says it is private or deleted. A warning that
 * fires on good videos is worse than no warning, because it teaches you to
 * ignore the one that matters.
 *
 * So this reports only what the page can actually establish on its own:
 *
 * - `playableInEmbed: false` — definitive, and the one an instructor causes
 *   themselves by switching «السماح بالتضمين» off.
 * - `UNPLAYABLE` / `ERROR` — the video itself is gone or the channel is
 *   terminated. These are never bot-challenge statuses.
 * - `LOGIN_REQUIRED`, or no marker at all — `unknown`. `probe()` resolves it
 *   with oEmbed, which is not challenged the same way.
 */
export function parseYouTubeEmbeddability(html: string): VideoEmbedStatus {
  const playableInEmbed = /"playableInEmbed":(true|false)/.exec(html)?.[1];
  if (playableInEmbed === 'false') return 'blocked';

  const status = /"playabilityStatus":\{"status":"([A-Z_]+)"/.exec(html)?.[1];
  if (status === undefined) return 'unknown';
  if (status === 'OK') return 'ok';
  // Gone or terminated — a fact about the video, not about who is asking.
  if (status === 'UNPLAYABLE' || status === 'ERROR') return 'unavailable';
  // LOGIN_REQUIRED, AGE_VERIFICATION_REQUIRED, CONTENT_CHECK_REQUIRED: every
  // one of these is ALSO what a challenged scraper sees. Not our call to make.
  return 'unknown';
}

/**
 * oEmbed's answer, which is the authority on the question we are actually
 * asking — "will this play inside our iframe".
 *
 * `https://www.youtube.com/oembed` is a small JSON endpoint rather than a
 * megabyte of watch page, and it is not behind the bot challenge: measured on
 * 2026-08-16 the same video that the watch page answered `LOGIN_REQUIRED` for
 * returned `200` here with its real title. Its statuses map cleanly:
 *
 * - `200` — public and embeddable. The all-clear, and it OVERRIDES a watch page
 *   that could not answer.
 * - `401`/`403` — refused: private, or embedding disabled. Which of the two is
 *   what the watch page is then consulted for.
 * - `404` — no such video.
 */
function embedStatusOfOEmbed(
  oembed: number | null,
  html: string | null,
): VideoEmbedStatus {
  if (oembed === 200) {
    // One exception, and only one: the watch page explicitly saying the embed
    // is off is a stronger statement than oEmbed's willingness to describe the
    // video. In practice they agree.
    return html !== null && /"playableInEmbed":false/.test(html) ? 'blocked' : 'ok';
  }
  if (oembed === 404) return 'unavailable';
  if (oembed === 401 || oembed === 403) {
    // Refused. The watch page separates "the owner turned embedding off" from
    // "this video is private or gone" — when it can be read at all.
    const fromPage = html === null ? 'unknown' : parseYouTubeEmbeddability(html);
    return fromPage === 'ok' || fromPage === 'unknown' ? 'unavailable' : fromPage;
  }
  // oEmbed itself did not answer (timeout, 5xx, rate limit). Fall back to
  // whatever the page could establish, which may well be `unknown`.
  return html === null ? 'unknown' : parseYouTubeEmbeddability(html);
}

export type YouTubeProbe = { durationSeconds: number | null; embed: VideoEmbedStatus };

/**
 * `videoDetails.lengthSeconds` in the JSON YouTube inlines into the watch page.
 *
 * The page carries the key TWICE — once in `videoDetails` and once per
 * `streamingData` format — and they disagree by a second, because a stream's
 * container is a hair longer than the video. `match` takes the FIRST, which is
 * `videoDetails`: the number YouTube itself prints under the player.
 */
export function parseYouTubeLengthSeconds(html: string): number | null {
  const match = /"lengthSeconds":"(\d{1,7})"/.exec(html);
  if (!match?.[1]) return null;
  const seconds = Number(match[1]);
  // A live stream reports 0. That is not a duration and must not be written as
  // one — a lesson whose video says "0 seconds" makes every percentage NaN.
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_SECONDS) return null;
  return seconds;
}

/**
 * How long a YouTube video is, asked of YouTube — from the SERVER.
 *
 * ## Why the server and not the browser
 *
 * This used to run only in the admin's browser, as a hidden IFrame player
 * reading `getDuration()`. That works right up until it doesn't: an ad blocker
 * eating `youtube.com/iframe_api`, a strict-privacy extension, an
 * embedding-disabled video — and the field stayed empty, so the instructor was
 * back to counting seconds off a YouTube page. That is the exact thing the
 * feature exists to prevent, and it is not something a retry button fixes.
 *
 * The watch page states the number in `videoDetails.lengthSeconds`, needs no
 * API key, no quota and no secret to rotate, and answers for videos the embed
 * player refuses. The browser probe stays as a SECOND chance (the admin's IP
 * and cookies are not ours), but the save no longer depends on it.
 *
 * ## Why this is not an SSRF
 *
 * The only input is an 11-character id that `extractYouTubeId` has already
 * reduced a URL to, and it is re-checked here against `YOUTUBE_ID_RE` before
 * being interpolated. The origin is hardcoded. There is no path by which a
 * caller-supplied host, scheme or port reaches `fetch`.
 */
@Injectable()
export class YouTubeDurationService {
  private readonly logger = new Logger(YouTubeDurationService.name);

  /** The number alone — what `setVideo` needs to satisfy a NOT NULL column. */
  async durationOf(externalId: string, options?: { timeoutMs?: number }): Promise<number | null> {
    return (await this.probe(externalId, options)).durationSeconds;
  }

  /**
   * The duration, and whether the video will embed — TWO endpoints, because one
   * of them lies to a datacenter and the other does not.
   *
   * The watch page carries the duration and is the only source for it. oEmbed
   * carries the embed verdict and is the only source we can trust for THAT: the
   * watch page answers a challenged server `LOGIN_REQUIRED`, which is
   * indistinguishable from a private video and is what made this accuse a
   * perfectly public lecture of being deleted. See `embedStatusOfOEmbed`.
   *
   * They run together, so this is one round trip's worth of latency, and a
   * failure of either leaves the other's answer intact.
   */
  async probe(externalId: string, { timeoutMs = 8000 } = {}): Promise<YouTubeProbe> {
    if (!YOUTUBE_ID_RE.test(externalId)) return { durationSeconds: null, embed: 'unknown' };

    const [html, oembed] = await Promise.all([
      this.fetchWatchPage(externalId, timeoutMs),
      this.fetchOEmbedStatus(externalId, timeoutMs),
    ]);

    return {
      durationSeconds: html === null ? null : parseYouTubeLengthSeconds(html),
      embed: embedStatusOfOEmbed(oembed, html),
    };
  }

  /** The page `lengthSeconds` lives in. `null` when it could not be read. */
  private async fetchWatchPage(externalId: string, timeoutMs: number): Promise<string | null> {
    const url = new URL('https://www.youtube.com/watch');
    url.searchParams.set('v', externalId);
    // `hl=en` keeps the markup stable regardless of where the VPS looks like it
    // is; `bpctr` is the "before playback consent" timestamp — far in the
    // future, it skips the interstitial that would otherwise replace the page
    // for a datacenter IP with no cookies.
    url.searchParams.set('hl', 'en');
    url.searchParams.set('bpctr', '9999999999');

    try {
      const response = await fetch(url, {
        headers: {
          // Cloudflare-style bot checks and YouTube's own consent wall both key
          // on a missing UA, and a default Node one is a tell.
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'accept-language': 'en-US,en;q=0.9',
          // The consent cookies Google sets itself on first visit. Without them
          // the EU consent page is served instead of the video page, and it
          // carries no `lengthSeconds` at all.
          cookie: 'CONSENT=YES+1; SOCS=CAI',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) return null;
      return await response.text();
    } catch (error) {
      // A timeout, a DNS failure, YouTube answering with something unparseable:
      // all the same answer — "we could not find out" — which the caller turns
      // into a message rather than a 500. Logged because a sudden run of these
      // means YouTube changed the page, not that every video went private.
      this.logger.warn(
        `watch-page probe failed for ${externalId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }

  /**
   * oEmbed's HTTP status, which is the whole of its answer — the body is only
   * ever used to confirm it is really JSON we got.
   *
   * `null` means oEmbed itself did not answer, which is different from it
   * answering "no".
   */
  private async fetchOEmbedStatus(externalId: string, timeoutMs: number): Promise<number | null> {
    // Built from the id against a hardcoded origin, never from caller input —
    // same rule as `youTubeEmbedUrl`.
    const url = new URL('https://www.youtube.com/oembed');
    url.searchParams.set('url', `https://youtu.be/${externalId}`);
    url.searchParams.set('format', 'json');

    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      return response.status;
    } catch (error) {
      this.logger.warn(
        `oembed probe failed for ${externalId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }
}
