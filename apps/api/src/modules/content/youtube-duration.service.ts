import { Injectable, Logger } from '@nestjs/common';
import { YOUTUBE_ID_RE, type VideoEmbedStatus } from '@ayman/contracts/video';

/** YouTube caps uploads at 12 hours, and so does `LessonVideoInputSchema`. */
const MAX_SECONDS = 12 * 60 * 60;

/**
 * Whether YouTube will let this video play INSIDE our page, read off the same
 * watch page the duration comes from.
 *
 * This is the gap that produced «الفيديو مش متاح دلوقتي» for students on a
 * lecture the instructor had saved without seeing any error. The save's only
 * gate is "can we obtain a duration", and the duration comes from the watch
 * page — which answers happily for a video the embed player will refuse. So an
 * embedding-disabled, private, age-restricted or region-blocked video saved
 * clean, with a correct duration, and then failed at the student's first tap.
 *
 * The page states the answer directly and we are already fetching it:
 * `playabilityStatus.status` covers removed/private/age-gated, and
 * `playableInEmbed` covers the one an instructor is most likely to have caused
 * themselves — «السماح بالتضمين» switched off in YouTube Studio.
 */
export function parseYouTubeEmbeddability(html: string): VideoEmbedStatus {
  const status = /"playabilityStatus":\{"status":"([A-Z_]+)"/.exec(html)?.[1];
  // No marker at all means the page was not the page we expected (a consent
  // wall, a captcha, a redesign) — "we could not find out", never "it is fine".
  if (status === undefined) return 'unknown';
  if (status !== 'OK') return 'unavailable';

  const playableInEmbed = /"playableInEmbed":(true|false)/.exec(html)?.[1];
  // Absent on a playable video is normal; only an explicit `false` is a block.
  return playableInEmbed === 'false' ? 'blocked' : 'ok';
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
   * The duration AND whether the video will embed, from ONE fetch.
   *
   * Both facts live in the same watch page, so asking separately would double
   * the requests to YouTube for no new information — and would let the two
   * answers describe different moments.
   */
  async probe(externalId: string, { timeoutMs = 8000 } = {}): Promise<YouTubeProbe> {
    if (!YOUTUBE_ID_RE.test(externalId)) return { durationSeconds: null, embed: 'unknown' };

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
      if (!response.ok) return { durationSeconds: null, embed: 'unknown' };
      const html = await response.text();
      return {
        durationSeconds: parseYouTubeLengthSeconds(html),
        embed: parseYouTubeEmbeddability(html),
      };
    } catch (error) {
      // A timeout, a DNS failure, YouTube answering with something unparseable:
      // all the same answer — "we could not find out" — which the caller turns
      // into a message rather than a 500. Logged because a sudden run of these
      // means YouTube changed the page, not that every video went private.
      this.logger.warn(
        `duration probe failed for ${externalId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return { durationSeconds: null, embed: 'unknown' };
    }
  }
}
