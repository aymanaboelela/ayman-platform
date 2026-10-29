/**
 * Google OAuth 2.0 and the YouTube Data API v3, over `fetch`, with nothing
 * else in it.
 *
 * No SDK on purpose: `googleapis` is ~80 MB of generated code for the nine
 * calls below, and the social studio's `MetaGraphClient` already set the
 * shape — a class over an injected `fetch`, so the specs script Google's
 * answers instead of mocking a module.
 *
 * ## Quota (10,000 units a day per Google Cloud project)
 *
 *   list calls (channels, playlistItems, videos)   1
 *   captions.list                                  50
 *   videos.update / thumbnails.set                 50
 *   captions.download                              200
 *
 * Every method here is one press of one button. Nothing loops over a channel.
 */

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const API = 'https://www.googleapis.com/youtube/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/youtube/v3';

/** Manage the channel's videos (title, description, tags, thumbnails, captions). */
export const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl';

const CALL_TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * Google refused. `message` is Google's own English sentence, which the admin
 * screen shows as is — «The authenticated user doesn't have permissions to
 * upload and set custom video thumbnails» tells the teacher to verify the
 * channel better than any translation of a status code could.
 */
export class YoutubeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** `errors[0].reason` from the API, or the OAuth `error` code (`invalid_grant`). */
    readonly reason: string | null,
  ) {
    super(message);
    this.name = 'YoutubeApiError';
  }

  /** The project's 10,000 units for the day are spent. Google resets them at midnight Pacific. */
  get quotaExceeded(): boolean {
    return this.reason === 'quotaExceeded' || this.reason === 'dailyLimitExceeded';
  }

  /** The grant is gone — revoked from the Google account, or expired for good. Only the token endpoint says this. */
  get grantRevoked(): boolean {
    return this.reason === 'invalid_grant';
  }
}

export interface TokenGrant {
  accessToken: string;
  expiresIn: number;
  refreshToken: string | null;
  scope: string;
}

export interface RawChannel {
  id: string;
  snippet?: {
    title?: string;
    customUrl?: string;
    thumbnails?: Record<string, { url?: string }>;
  };
  statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
}

export interface RawSnippet {
  title?: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
  channelId?: string;
  publishedAt?: string;
  thumbnails?: Record<string, { url?: string; width?: number; height?: number }>;
}

export interface RawVideo {
  id: string;
  snippet?: RawSnippet;
  status?: { privacyStatus?: string };
  statistics?: { viewCount?: string; likeCount?: string };
  contentDetails?: { duration?: string };
}

export interface RawCaption {
  id: string;
  snippet?: { language?: string; trackKind?: string; name?: string; status?: string };
}

export interface SeenUpload {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
}

/** Exactly the writable fields of `snippet` — what `videos.update` is sent. */
export interface WritableSnippet {
  title: string;
  description: string;
  categoryId: string;
  tags?: string[];
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
}

function clip(text: string, max = 400): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function failure(response: Response): Promise<YoutubeApiError> {
  const text = await response.text().catch(() => '');
  let message = `youtube responded ${response.status}`;
  let reason: string | null = null;
  try {
    const body = JSON.parse(text) as {
      error?: string | { message?: string; errors?: { reason?: string; message?: string }[] };
      error_description?: string;
    };
    if (typeof body.error === 'string') {
      // The OAuth endpoints: `{ error: 'invalid_grant', error_description }`.
      reason = body.error;
      message = body.error_description ?? body.error;
    } else if (body.error) {
      reason = body.error.errors?.[0]?.reason ?? null;
      message = body.error.message ?? body.error.errors?.[0]?.message ?? message;
    }
  } catch {
    // Not JSON (a proxy's HTML page) — the status line is all there is.
  }
  return new YoutubeApiError(clip(message), response.status, reason);
}

export class YoutubeApiClient {
  constructor(private readonly fetchFn: FetchFn) {}

  authUrl(input: { clientId: string; redirectUri: string; state: string }): string {
    const url = new URL(AUTH_URL);
    url.searchParams.set('client_id', input.clientId);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', YOUTUBE_SCOPE);
    // A REFRESH token, and a fresh one every time: without `prompt=consent`
    // Google hands a refresh token only on the very first consent, and a
    // reconnect after «فك الربط» would come back with none.
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('state', input.state);
    return url.toString();
  }

  private async form(url: string, body: Record<string, string>): Promise<Response> {
    return this.fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  }

  async exchangeCode(input: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    code: string;
  }): Promise<TokenGrant> {
    const response = await this.form(TOKEN_URL, {
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: 'authorization_code',
    });
    if (!response.ok) throw await failure(response);
    const body = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
      scope?: string;
    };
    if (!body.access_token) throw new YoutubeApiError('no access token in the response', 502, null);
    return {
      accessToken: body.access_token,
      expiresIn: body.expires_in ?? 3600,
      refreshToken: body.refresh_token ?? null,
      scope: body.scope ?? '',
    };
  }

  async refresh(input: { clientId: string; clientSecret: string; refreshToken: string }): Promise<TokenGrant> {
    const response = await this.form(TOKEN_URL, {
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: 'refresh_token',
    });
    if (!response.ok) throw await failure(response);
    const body = (await response.json()) as { access_token?: string; expires_in?: number; scope?: string };
    if (!body.access_token) throw new YoutubeApiError('no access token in the response', 502, null);
    return { accessToken: body.access_token, expiresIn: body.expires_in ?? 3600, refreshToken: null, scope: body.scope ?? '' };
  }

  /** `true` when Google confirmed. A token Google no longer knows is as good as revoked. */
  async revoke(token: string): Promise<boolean> {
    try {
      const response = await this.form(REVOKE_URL, { token });
      return response.ok || response.status === 400;
    } catch {
      return false;
    }
  }

  private async get<T>(path: string, params: Record<string, string>, accessToken: string): Promise<T> {
    const url = new URL(`${API}/${path}`);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    const response = await this.fetchFn(url.toString(), {
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    if (!response.ok) throw await failure(response);
    return (await response.json()) as T;
  }

  async myChannel(accessToken: string): Promise<RawChannel | null> {
    const body = await this.get<{ items?: RawChannel[] }>(
      'channels',
      { part: 'snippet,statistics,contentDetails', mine: 'true' },
      accessToken,
    );
    return body.items?.[0] ?? null;
  }

  async uploads(
    accessToken: string,
    playlistId: string,
    pageToken: string | null,
    maxResults: number,
  ): Promise<{ videoIds: string[]; nextPageToken: string | null; totalResults: number | null }> {
    const body = await this.get<{
      items?: { contentDetails?: { videoId?: string } }[];
      nextPageToken?: string;
      pageInfo?: { totalResults?: number };
    }>(
      'playlistItems',
      {
        part: 'contentDetails',
        playlistId,
        maxResults: String(maxResults),
        ...(pageToken ? { pageToken } : {}),
      },
      accessToken,
    );
    return {
      videoIds: (body.items ?? []).map((item) => item.contentDetails?.videoId).filter((id): id is string => Boolean(id)),
      nextPageToken: body.nextPageToken ?? null,
      totalResults: body.pageInfo?.totalResults ?? null,
    };
  }

  /**
   * The newest uploads with their titles — ONE call, 1 unit, whatever the
   * parts. What the watcher spends per run; nothing else is read.
   */
  async recentUploads(accessToken: string, playlistId: string, maxResults: number): Promise<SeenUpload[]> {
    const body = await this.get<{
      items?: {
        snippet?: { title?: string; thumbnails?: Record<string, { url?: string }>; resourceId?: { videoId?: string } };
        contentDetails?: { videoId?: string; videoPublishedAt?: string };
      }[];
    }>('playlistItems', { part: 'snippet,contentDetails', playlistId, maxResults: String(maxResults) }, accessToken);
    return (body.items ?? []).flatMap((item) => {
      const id = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
      if (!id) return [];
      const thumbs = item.snippet?.thumbnails ?? {};
      return [{
        id,
        title: item.snippet?.title ?? '',
        thumbnailUrl: thumbs['medium']?.url ?? thumbs['high']?.url ?? thumbs['default']?.url ?? null,
        publishedAt: item.contentDetails?.videoPublishedAt ?? null,
      }];
    });
  }

  async videos(accessToken: string, ids: readonly string[], parts: string): Promise<RawVideo[]> {
    if (ids.length === 0) return [];
    const body = await this.get<{ items?: RawVideo[] }>('videos', { part: parts, id: ids.join(',') }, accessToken);
    return body.items ?? [];
  }

  /**
   * ⚠️ `videos.update` REPLACES the snippet: a writable field missing from the
   * body is DELETED on YouTube (tags, description, default language…). The
   * caller sends the whole `WritableSnippet`, read-modify-write.
   */
  async updateSnippet(accessToken: string, id: string, snippet: WritableSnippet): Promise<RawVideo> {
    const response = await this.fetchFn(`${API}/videos?part=snippet`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ id, snippet }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    if (!response.ok) throw await failure(response);
    return (await response.json()) as RawVideo;
  }

  async setThumbnail(accessToken: string, videoId: string, bytes: Buffer, mime: string): Promise<void> {
    const url = new URL(`${UPLOAD_API}/thumbnails/set`);
    url.searchParams.set('videoId', videoId);
    url.searchParams.set('uploadType', 'media');
    const response = await this.fetchFn(url.toString(), {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': mime, accept: 'application/json' },
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    if (!response.ok) throw await failure(response);
  }

  async captions(accessToken: string, videoId: string): Promise<RawCaption[]> {
    const body = await this.get<{ items?: RawCaption[] }>('captions', { part: 'snippet', videoId }, accessToken);
    return body.items ?? [];
  }

  async downloadCaption(accessToken: string, captionId: string): Promise<string> {
    const url = new URL(`${API}/captions/${encodeURIComponent(captionId)}`);
    url.searchParams.set('tfmt', 'srt');
    const response = await this.fetchFn(url.toString(), {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    if (!response.ok) throw await failure(response);
    return response.text();
  }
}
