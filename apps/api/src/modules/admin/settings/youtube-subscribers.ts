/**
 * The YouTube half of «عدد السوشيال ميديا»'s automatic sync: from the channel
 * link the admin already stored in `contact.youtube` to a subscriber count.
 *
 * Pure functions over an injected `fetch`, so the spec drives every branch
 * without a network and `SocialCountsSyncService` stays a thin scheduler.
 */

/** One way of asking `channels.list` for a channel — its query parameter and value. */
export type ChannelLookup =
  | { by: 'id'; value: string }
  | { by: 'forHandle'; value: string }
  | { by: 'forUsername'; value: string };

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);

/** Path segments that are YouTube pages, never a legacy vanity channel name. */
const NOT_A_CHANNEL = new Set(['watch', 'shorts', 'playlist', 'results', 'feed', 'live', 'embed', 'hashtag', 'post']);

/**
 * The lookups to try, IN ORDER, for a stored channel link; `[]` when the link
 * names no channel (a video, `youtu.be/…`, another site).
 *
 *   · `/@handle`        → `forHandle` — what YouTube hands out today
 *   · `/channel/UC…`    → `id`
 *   · `/user/name`      → `forUsername` — the pre-2014 username
 *   · `/c/name`, `/name` → custom URLs have NO lookup in the API. Most of them
 *     were turned into the same-named handle in 2022, so `forHandle` first,
 *     then `forUsername` for the old accounts whose custom name was their
 *     username. Neither is guaranteed — a miss leaves the admin's figure.
 */
export function channelLookups(link: string | null | undefined): ChannelLookup[] {
  if (!link) return [];
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return [];
  }
  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return [];

  const segments = url.pathname.split('/').filter(Boolean).map(decodeSegment);
  const [first, second] = segments;
  if (!first) return [];

  if (first.startsWith('@') && first.length > 1) return [{ by: 'forHandle', value: first }];
  if (first === 'channel') return second && /^UC[\w-]{22}$/.test(second) ? [{ by: 'id', value: second }] : [];
  if (first === 'user') return second ? [{ by: 'forUsername', value: second }] : [];

  const custom = first === 'c' ? second : NOT_A_CHANNEL.has(first) ? undefined : first;
  return custom
    ? [
        { by: 'forHandle', value: `@${custom}` },
        { by: 'forUsername', value: custom },
      ]
    : [];
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export type SubscriberResult =
  | { kind: 'count'; count: number; channelId: string }
  /** The channel owner turned «عدد المشتركين» off on YouTube. */
  | { kind: 'hidden'; channelId: string };

export class YoutubeSyncError extends Error {
  override readonly name = 'YoutubeSyncError';
}

const ENDPOINT = 'https://www.googleapis.com/youtube/v3/channels';
/** Daily, in the background — nothing waits on it, but nothing should hang on it either. */
export const YOUTUBE_TIMEOUT_MS = 10_000;

interface ChannelsResponse {
  items?: {
    id?: string;
    statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
  }[];
}

/**
 * The channel's subscriber figure, walking `lookups` until one finds it.
 *
 * Throws `YoutubeSyncError` on anything that is not a clean answer — no
 * channel, a non-2xx (bad key, quota, outage), a timeout, a malformed body.
 * The caller treats every throw identically: keep the last saved figure.
 *
 * The key travels in the query string because that is the only way the Data
 * API accepts a plain key; it never reaches a log line here (errors carry the
 * status, not the URL).
 *
 * YouTube rounds public subscriber counts down to three significant figures,
 * which is also exactly what `shortFollowerCount` shows — so the figure on the
 * landing page agrees with the channel page.
 */
export async function fetchSubscriberCount(
  apiKey: string,
  lookups: readonly ChannelLookup[],
  fetchImpl: typeof fetch = fetch,
): Promise<SubscriberResult> {
  if (lookups.length === 0) throw new YoutubeSyncError('the channel link names no channel');

  for (const lookup of lookups) {
    const url = new URL(ENDPOINT);
    url.searchParams.set('part', 'statistics');
    url.searchParams.set(lookup.by, lookup.value);
    url.searchParams.set('key', apiKey);

    let response: Response;
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(YOUTUBE_TIMEOUT_MS) });
    } catch (error) {
      throw new YoutubeSyncError(`request failed: ${(error as Error).name}`);
    }
    if (!response.ok) throw new YoutubeSyncError(`YouTube answered ${response.status}`);

    let body: ChannelsResponse;
    try {
      body = (await response.json()) as ChannelsResponse;
    } catch {
      throw new YoutubeSyncError('YouTube answered a body that is not JSON');
    }

    const channel = body.items?.[0];
    if (!channel?.id || !channel.statistics) continue; // no such channel for this lookup — try the next

    if (channel.statistics.hiddenSubscriberCount) return { kind: 'hidden', channelId: channel.id };

    const count = Number(channel.statistics.subscriberCount);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new YoutubeSyncError('YouTube answered no usable subscriberCount');
    }
    return { kind: 'count', count, channelId: channel.id };
  }

  throw new YoutubeSyncError(`no channel found for ${lookups.map((l) => `${l.by}=${l.value}`).join(', ')}`);
}
