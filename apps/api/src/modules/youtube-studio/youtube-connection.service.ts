import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { YoutubeConnectStart, YoutubeStudioState } from '@ayman/contracts/youtube/studio';
import { AuditService } from '../../audit/audit.service';
import { loadEnv } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { openToken, sealToken, tokenHint, tokenKey } from '../social-posts/token-cipher';
import { issueState, verifyState } from './oauth-state';
import { YoutubeApiClient, YoutubeApiError, type RawChannel } from './youtube-api.client';

export const YOUTUBE_CONNECTION_ID = 1;
export const YOUTUBE_RESOURCE = 'youtube_connection';

/** Where the callback sends the browser back to; `?yt=` is read by the page. */
export type ConnectOutcome = 'connected' | 'denied' | 'expired' | 'noChannel' | 'noRefresh' | 'failed';

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Refresh a minute early — a token that expires mid-upload is a failed save. */
const ACCESS_TOKEN_MARGIN_MS = 60_000;

interface CachedAccess {
  /** The sealed refresh token this access token was minted from — a reconnect invalidates it. */
  sealed: string;
  token: string;
  expiresAt: number;
}

/** No connection, or a grant Google no longer honours. The screen asks to connect again. */
export class YoutubeNotConnectedException extends ConflictException {
  constructor() {
    super({ message: 'youtube channel is not connected', code: 'youtube_not_connected' });
  }
}

/**
 * The connected channel, and the ONE place its refresh token is ever opened.
 *
 * Same discipline as `SocialConnectionService` for the Facebook Page token:
 * the row holds AES-256-GCM ciphertext under a key derived from
 * `BETTER_AUTH_SECRET` (its own HKDF label, so the two sealed columns are not
 * interchangeable), `state()` returns the channel's public face and the last
 * four characters, and the plaintext exists only inside `accessToken()` and
 * `disconnect()`, on its way to Google.
 *
 * The short-lived ACCESS token is cached in memory only — never written to a
 * table — keyed on the ciphertext it was minted from, so a reconnect or a
 * disconnect drops it.
 */
@Injectable()
export class YoutubeConnectionService {
  private readonly logger = new Logger(YoutubeConnectionService.name);
  private readonly env = loadEnv(process.env);
  private readonly refreshKey = tokenKey(this.env.BETTER_AUTH_SECRET, 'youtube-refresh-token:v1');
  private readonly stateKey = tokenKey(this.env.BETTER_AUTH_SECRET, 'youtube-oauth-state:v1');
  private access: CachedAccess | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly google: YoutubeApiClient,
  ) {}

  /** `null` when either variable is missing — the screen shows «الربط مش متاح». */
  client(): OAuthClient | null {
    const { YOUTUBE_OAUTH_CLIENT_ID: clientId, YOUTUBE_OAUTH_CLIENT_SECRET: clientSecret } = this.env;
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret, redirectUri: `${this.env.APP_URL.replace(/\/$/, '')}/api/admin/youtube/oauth/callback` };
  }

  siteHost(): string {
    return new URL(this.env.APP_URL).host;
  }

  private row() {
    return this.prisma.youtubeConnection.findUnique({ where: { id: YOUTUBE_CONNECTION_ID } });
  }

  /** The connected channel as the API row has it, or `null` when the stored token does not open. */
  async channel(): Promise<{ id: string; uploadsPlaylistId: string | null } | null> {
    const row = await this.row();
    if (!row?.tokenCiphertext || !row.channelId) return null;
    if (openToken(row.tokenCiphertext, this.refreshKey) === null) return null;
    return { id: row.channelId, uploadsPlaylistId: row.uploadsPlaylistId };
  }

  async state(): Promise<YoutubeStudioState> {
    const [row, courses] = await Promise.all([
      this.row(),
      this.prisma.course.findMany({
        where: { status: 'published' },
        select: { id: true, title: true, slug: true },
        orderBy: [{ year: 'asc' }, { title: 'asc' }],
        take: 200,
      }),
    ]);
    const origin = this.env.APP_URL.replace(/\/$/, '');
    // A token sealed under a rotated secret reads as «not connected», the
    // social studio's rule: ask again rather than claim a link that fails.
    const usable = Boolean(row?.tokenCiphertext && row.channelId && openToken(row.tokenCiphertext, this.refreshKey) !== null);
    let connection: YoutubeStudioState['connection'] = null;
    if (usable && row) {
      connection = {
        channel: {
          id: row.channelId!,
          title: row.channelTitle ?? '',
          avatarUrl: row.channelAvatarUrl,
          customUrl: row.channelCustomUrl,
          subscriberCount: null,
          videoCount: null,
        },
        tokenHint: row.tokenHint,
        connectedAt: (row.connectedAt ?? row.updatedAt).toISOString(),
      };
      // Live counts are one unit; the screen is not worth breaking if Google is slow.
      try {
        const live = await this.withAccess((token) => this.google.myChannel(token));
        if (live) connection.channel = { ...connection.channel, ...channelFace(live) };
      } catch (error) {
        if (error instanceof YoutubeNotConnectedException) connection = null;
        else this.logger.warn(`channel stats unavailable: ${describe(error)}`);
      }
    }
    const newVideos = connection
      ? await this.prisma.youtubeVideo.findMany({
          where: { channelId: connection.channel.id, isNew: true, handledAt: null },
          orderBy: [{ publishedAt: 'desc' }, { firstSeenAt: 'desc' }],
          select: { videoId: true, title: true, thumbnailUrl: true, publishedAt: true },
          take: 5,
        })
      : [];
    return {
      configured: this.client() !== null,
      connection,
      newVideos: newVideos.map((video) => ({
        id: video.videoId,
        title: video.title,
        thumbnailUrl: video.thumbnailUrl,
        publishedAt: video.publishedAt?.toISOString() ?? null,
      })),
      courses: courses.map((course) => ({
        id: course.id,
        title: course.title,
        url: `${origin}/courses/${encodeURIComponent(course.slug)}`,
      })),
      siteHost: this.siteHost(),
    };
  }

  /**
   * Step one: mint the state, park its hash on the row, hand back Google's URL.
   * A second press replaces the first state — only the latest round-trip in
   * flight can finish.
   */
  async start(userId: string): Promise<YoutubeConnectStart> {
    const client = this.client();
    if (!client) throw new NotFoundException('youtube connection is not configured on this platform');
    const issued = issueState(userId, this.stateKey);
    const pending = {
      pendingStateHash: issued.nonceHash,
      pendingStateUserId: userId,
      pendingStateExpiresAt: issued.expiresAt,
    };
    await this.prisma.youtubeConnection.upsert({
      where: { id: YOUTUBE_CONNECTION_ID },
      create: { id: YOUTUBE_CONNECTION_ID, ...pending },
      update: pending,
    });
    return { url: this.google.authUrl({ clientId: client.clientId, redirectUri: client.redirectUri, state: issued.state }) };
  }

  /**
   * Step two, the callback. Never throws: every way it can end is an outcome
   * the page renders, because the browser arrived here from Google and an
   * API error page would strand the teacher outside the admin.
   */
  async complete(
    userId: string,
    query: { code?: string; state?: string; error?: string },
  ): Promise<ConnectOutcome> {
    const client = this.client();
    if (!client) return 'failed';

    const nonceHash = verifyState(query.state, userId, this.stateKey);
    if (!nonceHash) return 'expired';
    // One use: whoever clears the hash first owns this callback.
    const consumed = await this.prisma.youtubeConnection.updateMany({
      where: {
        id: YOUTUBE_CONNECTION_ID,
        pendingStateHash: nonceHash,
        pendingStateUserId: userId,
        pendingStateExpiresAt: { gt: new Date() },
      },
      data: { pendingStateHash: null, pendingStateUserId: null, pendingStateExpiresAt: null },
    });
    if (consumed.count !== 1) return 'expired';

    if (query.error || !query.code) return 'denied';

    try {
      const grant = await this.google.exchangeCode({ ...client, code: query.code });
      if (!grant.refreshToken) {
        await this.google.revoke(grant.accessToken);
        return 'noRefresh';
      }
      const channel = await this.google.myChannel(grant.accessToken);
      if (!channel) {
        await this.google.revoke(grant.refreshToken);
        return 'noChannel';
      }

      const before = await this.row();
      const face = channelFace(channel);
      const sealed = sealToken(grant.refreshToken, this.refreshKey);
      /*
       * ⚠️ The PREVIOUS refresh token is not revoked here. Google's revoke
       * ends the whole GRANT, and a reconnect with the same Google account
       * and client is the same grant — revoking the old token would revoke
       * the one just issued. «فك الربط» is the revoke.
       */
      await this.prisma.youtubeConnection.update({
        where: { id: YOUTUBE_CONNECTION_ID },
        data: {
          channelId: channel.id,
          channelTitle: face.title,
          channelAvatarUrl: face.avatarUrl,
          channelCustomUrl: face.customUrl,
          uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads ?? null,
          tokenCiphertext: sealed,
          tokenHint: tokenHint(grant.refreshToken),
          connectedBy: userId,
          connectedAt: new Date(),
        },
      });
      this.access = {
        sealed,
        token: grant.accessToken,
        expiresAt: Date.now() + grant.expiresIn * 1000 - ACCESS_TOKEN_MARGIN_MS,
      };

      await this.audit.record({
        action: 'youtube:connect',
        resourceType: YOUTUBE_RESOURCE,
        resourceId: String(YOUTUBE_CONNECTION_ID),
        outcome: 'success',
        // Which channel, and whether one was replaced — never the token.
        metadata: {
          channelId: channel.id,
          channelTitle: face.title,
          replacedChannelId: before?.channelId && before.channelId !== channel.id ? before.channelId : null,
        },
      });
      return 'connected';
    } catch (error) {
      this.logger.warn(`youtube connect failed: ${describe(error)}`);
      return 'failed';
    }
  }

  async disconnect(): Promise<{ revoked: boolean }> {
    const row = await this.row();
    if (!row?.tokenCiphertext && !row?.channelId) return { revoked: false };
    const refresh = row.tokenCiphertext ? openToken(row.tokenCiphertext, this.refreshKey) : null;
    const revoked = refresh ? await this.google.revoke(refresh) : false;

    await this.prisma.youtubeConnection.deleteMany({ where: { id: YOUTUBE_CONNECTION_ID } });
    this.access = null;

    await this.audit.record({
      action: 'youtube:disconnect',
      resourceType: YOUTUBE_RESOURCE,
      resourceId: String(YOUTUBE_CONNECTION_ID),
      outcome: 'success',
      metadata: { channelId: row.channelId, revokedAtGoogle: revoked },
    });
    return { revoked };
  }

  /** Forget the in-memory access token — after Google answered 401 to it. */
  dropAccessToken(): void {
    this.access = null;
  }

  /** A live access token, refreshed when it is about to lapse. */
  async accessToken(): Promise<string> {
    const client = this.client();
    const row = await this.row();
    if (!client || !row?.tokenCiphertext) throw new YoutubeNotConnectedException();
    if (this.access && this.access.sealed === row.tokenCiphertext && this.access.expiresAt > Date.now()) {
      return this.access.token;
    }
    const refreshToken = openToken(row.tokenCiphertext, this.refreshKey);
    if (!refreshToken) throw new YoutubeNotConnectedException();
    try {
      const grant = await this.google.refresh({ clientId: client.clientId, clientSecret: client.clientSecret, refreshToken });
      this.access = {
        sealed: row.tokenCiphertext,
        token: grant.accessToken,
        expiresAt: Date.now() + grant.expiresIn * 1000 - ACCESS_TOKEN_MARGIN_MS,
      };
      return grant.accessToken;
    } catch (error) {
      // Revoked from the Google account's security page: the row is a lie now.
      if (error instanceof YoutubeApiError && error.grantRevoked) throw new YoutubeNotConnectedException();
      throw error;
    }
  }

  /**
   * Run one Google call with a live token, and once more with a fresh one if
   * Google says the token it had is no good (401) — an access token can be
   * killed before its `expires_in`.
   */
  async withAccess<T>(work: (token: string) => Promise<T>): Promise<T> {
    const token = await this.accessToken();
    try {
      return await work(token);
    } catch (error) {
      if (!(error instanceof YoutubeApiError) || error.status !== 401) throw error;
      this.dropAccessToken();
      return work(await this.accessToken());
    }
  }
}

function channelFace(channel: RawChannel) {
  const thumbs = channel.snippet?.thumbnails ?? {};
  const avatar = thumbs['medium']?.url ?? thumbs['default']?.url ?? thumbs['high']?.url ?? null;
  const stats = channel.statistics;
  return {
    title: channel.snippet?.title ?? '',
    avatarUrl: avatar,
    customUrl: channel.snippet?.customUrl ?? null,
    subscriberCount: stats?.hiddenSubscriberCount ? null : toInt(stats?.subscriberCount),
    videoCount: toInt(stats?.videoCount),
  };
}

export function toInt(value: string | undefined | null): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** An error's message for a log line — never a token, which no error here carries. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
