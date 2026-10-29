import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { copy } from '@ayman/contracts/copy';
import {
  MAX_YOUTUBE_THUMBNAIL_BYTES,
  YOUTUBE_PAGE_SIZE,
  YoutubePrivacySchema,
  YoutubeVideoIdSchema,
  youtubeCourseLink,
  youtubeVideoFlags,
  type YoutubeSuggestion,
  type YoutubeSuggestRequest,
  type YoutubeVideoDetail,
  type YoutubeVideoList,
  type YoutubeVideoRow,
  type YoutubeVideoUpdate,
} from '@ayman/contracts/youtube/studio';
import { AuditService } from '../../audit/audit.service';
import { tenantName } from '../../common/tenant';
import { loadEnv } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import type { AnswerProvider } from '../assistant/ai/providers/answer-provider';
import { selectAnswerProvider } from '../assistant/ai/providers/select-provider';
import { FileSignatureService } from '../media/file-signature.service';
import { YOUTUBE_RESOURCE, YoutubeConnectionService, YoutubeNotConnectedException, toInt } from './youtube-connection.service';
import { YoutubeApiClient, YoutubeApiError, type RawCaption, type RawVideo, type WritableSnippet } from './youtube-api.client';
import { YoutubeWatchService } from './youtube-watch.service';
import {
  SUGGEST_QUESTION,
  SUGGEST_SYSTEM,
  buildSuggestContext,
  composeSuggestion,
  parseIsoDuration,
  parseSrt,
  transcriptForPrompt,
  type Cue,
} from './youtube-suggest';

export interface UploadFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

/**
 * «Cache the list for a minute.» A page of 50 is 2 quota units; the admin
 * flipping filters, opening and closing the drawer, or coming back from
 * another tab should not spend them again. Any write through this service
 * empties it, so a save is never followed by the stale row.
 */
const LIST_TTL_MS = 60_000;

/** «اقترح لي» writes a description AND chapters — more room than a chat reply. */
const SUGGEST_TIMEOUT_MS = 60_000;
const SUGGEST_MAX_TOKENS = 4096;

const THUMBNAIL_MIME = new Set(['image/jpeg', 'image/png']);

const PLATFORM_NAME = tenantName(copy.site.platformName);

/**
 * «يوتيوب» — the channel's uploads, one video's SEO, and «اقترح لي».
 *
 * Every Google call goes through `YoutubeConnectionService.withAccess`, the
 * only holder of the refresh token. Every write is audited, with the video id
 * and WHICH fields were sent — never their text, which is already public on
 * YouTube and would bloat an append-only chain.
 */
@Injectable()
export class YoutubeStudioService {
  private readonly logger = new Logger(YoutubeStudioService.name);
  private readonly listCache = new Map<string, { at: number; value: YoutubeVideoList }>();
  private provider: AnswerProvider | null | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly connection: YoutubeConnectionService,
    private readonly google: YoutubeApiClient,
    private readonly signature: FileSignatureService,
    private readonly watcher: YoutubeWatchService,
  ) {}

  /** Built on first use, not at boot: most stacks never press «اقترح لي». */
  private ai(): AnswerProvider | null {
    if (this.provider === undefined) this.provider = selectAnswerProvider(SUGGEST_TIMEOUT_MS);
    return this.provider;
  }

  private invalidate(): void {
    this.listCache.clear();
  }

  /** Google's refusal, as the admin should read it: its own sentence, its own status family. */
  private rethrow(error: unknown): never {
    if (error instanceof HttpException) throw error;
    if (error instanceof YoutubeApiError && error.quotaExceeded) {
      throw new HttpException({ statusCode: 429, message: error.message, code: 'youtube_quota' }, 429);
    }
    if (error instanceof YoutubeApiError) {
      const status = error.status === 403 || error.status === 400 || error.status === 404 ? error.status : 502;
      throw new HttpException({ statusCode: status, message: error.message, code: 'youtube' }, status);
    }
    this.logger.warn(`youtube call failed: ${error instanceof Error ? error.message : 'unknown'}`);
    throw new BadGatewayException('could not reach YouTube');
  }

  private async channel(): Promise<{ id: string; uploadsPlaylistId: string | null }> {
    const channel = await this.connection.channel();
    if (!channel) throw new YoutubeNotConnectedException();
    return channel;
  }

  async list(pageToken: string | null): Promise<YoutubeVideoList> {
    if (pageToken !== null && !/^[A-Za-z0-9_-]{1,64}$/.test(pageToken)) throw new BadRequestException('bad page token');
    const channel = await this.channel();
    const cacheKey = `${channel.id}:${pageToken ?? ''}`;
    const hit = this.listCache.get(cacheKey);
    if (hit && Date.now() - hit.at < LIST_TTL_MS) return this.enrich(hit.value);

    try {
      const value = await this.connection.withAccess(async (token) => {
        const playlist = channel.uploadsPlaylistId ?? `UU${channel.id.slice(2)}`;
        const page = await this.google.uploads(token, playlist, pageToken, YOUTUBE_PAGE_SIZE);
        const videos = await this.google.videos(token, page.videoIds, 'snippet,status,statistics');
        const byId = new Map(videos.map((video) => [video.id, video]));
        // Playlist order (newest upload first), not whatever order `videos.list` answers in.
        const items = page.videoIds
          .map((id) => byId.get(id))
          .filter((video): video is RawVideo => Boolean(video))
          .map((video) => this.row(video));
        return { items, nextPageToken: page.nextPageToken, totalResults: page.totalResults };
      });
      this.listCache.set(cacheKey, { at: Date.now(), value });
      // The first page already holds the newest uploads: noticing a new one
      // here is free, and does not wait for the watcher's half-hour.
      if (pageToken === null) {
        await this.watcher
          .record(
            channel.id,
            value.items.map((item) => ({ id: item.id, title: item.title, thumbnailUrl: item.thumbnailUrl, publishedAt: item.publishedAt })),
          )
          .catch(() => []);
      }
      return this.enrich(value);
    } catch (error) {
      this.rethrow(error);
    }
  }

  /** The platform's own facts about each row — read fresh, never cached with Google's. */
  private async enrich(list: YoutubeVideoList): Promise<YoutubeVideoList> {
    const known = await this.seen(list.items.map((item) => item.id));
    return {
      ...list,
      items: list.items.map((item) => ({ ...item, ...(known.get(item.id) ?? { isNew: false, thumbnailSetHere: false }) })),
    };
  }

  private async seen(ids: readonly string[]): Promise<Map<string, { isNew: boolean; thumbnailSetHere: boolean }>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.youtubeVideo.findMany({
      where: { videoId: { in: [...ids] } },
      select: { videoId: true, isNew: true, handledAt: true, thumbnailSetAt: true },
    });
    return new Map(
      rows.map((row) => [row.videoId, { isNew: row.isNew && row.handledAt === null, thumbnailSetHere: row.thumbnailSetAt !== null }]),
    );
  }

  /** «خلاص» on the new-video card — ends the badge without a save (it was done in YouTube Studio). */
  async markHandled(id: string): Promise<{ ok: true }> {
    this.assertVideoId(id);
    await this.prisma.youtubeVideo.updateMany({ where: { videoId: id, handledAt: null }, data: { handledAt: new Date() } });
    return { ok: true };
  }

  private row(video: RawVideo): YoutubeVideoRow {
    const snippet = video.snippet ?? {};
    const privacy = YoutubePrivacySchema.safeParse(video.status?.privacyStatus);
    return {
      id: video.id,
      title: snippet.title ?? '',
      thumbnailUrl: thumbnail(snippet.thumbnails),
      privacy: privacy.success ? privacy.data : null,
      views: toInt(video.statistics?.viewCount),
      likes: toInt(video.statistics?.likeCount),
      publishedAt: snippet.publishedAt ?? null,
      flags: youtubeVideoFlags(snippet, this.connection.siteHost()),
      categoryId: snippet.categoryId ?? null,
      isNew: false,
      thumbnailSetHere: false,
    };
  }

  private assertVideoId(id: string): void {
    if (!YoutubeVideoIdSchema.safeParse(id).success) throw new NotFoundException();
  }

  /** The video as Google has it, refused unless it is on the CONNECTED channel. */
  private async fetchOwn(token: string, channelId: string, id: string, parts: string): Promise<RawVideo> {
    const [video] = await this.google.videos(token, [id], parts);
    if (!video || video.snippet?.channelId !== channelId) throw new NotFoundException('video not found on the connected channel');
    return video;
  }

  async get(id: string): Promise<YoutubeVideoDetail> {
    this.assertVideoId(id);
    const channel = await this.channel();
    try {
      const video = await this.connection.withAccess((token) =>
        this.fetchOwn(token, channel.id, id, 'snippet,status,statistics,contentDetails'),
      );
      const known = (await this.seen([id])).get(id);
      return { ...this.detail(video), ...(known ?? {}) };
    } catch (error) {
      this.rethrow(error);
    }
  }

  private detail(video: RawVideo): YoutubeVideoDetail {
    const snippet = video.snippet ?? {};
    return {
      ...this.row(video),
      description: snippet.description ?? '',
      tags: snippet.tags ?? [],
      categoryId: snippet.categoryId ?? '27',
      defaultLanguage: snippet.defaultLanguage ?? null,
      duration: video.contentDetails?.duration ?? null,
    };
  }

  /**
   * READ-MODIFY-WRITE. `videos.update` replaces the whole snippet, so the
   * current one is read first (1 unit) and every writable field the admin did
   * not send is written back as YouTube had it — `defaultLanguage` and
   * `defaultAudioLanguage` included, which this screen never edits and a
   * naive update would erase.
   */
  async update(id: string, input: YoutubeVideoUpdate): Promise<YoutubeVideoDetail> {
    this.assertVideoId(id);
    const channel = await this.channel();
    const fields = Object.keys(input).sort();
    try {
      await this.connection.withAccess(async (token) => {
        const current = await this.fetchOwn(token, channel.id, id, 'snippet');
        await this.google.updateSnippet(token, id, mergeSnippet(current.snippet ?? {}, input));
      });
    } catch (error) {
      await this.audit.record({
        action: 'youtube:update',
        resourceType: YOUTUBE_RESOURCE,
        resourceId: id,
        outcome: 'failure',
        metadata: { videoId: id, fields, error: error instanceof Error ? error.message.slice(0, 200) : 'unknown' },
      });
      this.rethrow(error);
    }
    this.invalidate();
    // A save from here IS handling it: the «جديد» badge ends.
    await this.prisma.youtubeVideo.updateMany({
      where: { videoId: id },
      data: { handledAt: new Date(), ...(input.title ? { title: input.title } : {}) },
    });
    await this.audit.record({
      action: 'youtube:update',
      resourceType: YOUTUBE_RESOURCE,
      resourceId: id,
      outcome: 'success',
      metadata: { videoId: id, fields },
    });
    return this.get(id);
  }

  async thumbnail(id: string, file: UploadFile): Promise<YoutubeVideoDetail> {
    this.assertVideoId(id);
    if (file.size > MAX_YOUTUBE_THUMBNAIL_BYTES) throw new PayloadTooLargeException('thumbnail too large');
    const detected = await this.signature.detect(file.buffer);
    if (!detected || !THUMBNAIL_MIME.has(detected.mime)) {
      throw new BadRequestException('file contents are not an allowed image type');
    }
    const channel = await this.channel();
    try {
      await this.connection.withAccess(async (token) => {
        await this.fetchOwn(token, channel.id, id, 'snippet');
        await this.google.setThumbnail(token, id, file.buffer, detected.mime);
      });
    } catch (error) {
      await this.audit.record({
        action: 'youtube:thumbnail',
        resourceType: YOUTUBE_RESOURCE,
        resourceId: id,
        outcome: 'failure',
        metadata: { videoId: id, error: error instanceof Error ? error.message.slice(0, 200) : 'unknown' },
      });
      this.rethrow(error);
    }
    this.invalidate();
    await this.prisma.youtubeVideo.updateMany({ where: { videoId: id }, data: { thumbnailSetAt: new Date() } });
    await this.audit.record({
      action: 'youtube:thumbnail',
      resourceType: YOUTUBE_RESOURCE,
      resourceId: id,
      outcome: 'success',
      metadata: { videoId: id, mime: detected.mime, bytes: file.size },
    });
    return this.get(id);
  }

  /**
   * «اقترح لي». Writes nothing — not to YouTube, not to a table: the answer
   * fills the form and the admin's حفظ is the only write.
   */
  async suggest(id: string, input: YoutubeSuggestRequest): Promise<YoutubeSuggestion> {
    this.assertVideoId(id);
    const provider = this.ai();
    if (!provider) throw new ServiceUnavailableException({ message: 'no AI provider is configured on this platform', code: 'ai_unavailable' });
    const channel = await this.channel();

    const courseLink = input.courseId ? await this.courseLink(input.courseId, id) : null;

    let video: RawVideo;
    let cues: Cue[] = [];
    try {
      video = await this.connection.withAccess((token) =>
        this.fetchOwn(token, channel.id, id, 'snippet,contentDetails'),
      );
      cues = await this.connection.withAccess((token) => this.captionCues(token, id));
    } catch (error) {
      this.rethrow(error);
    }

    const snippet = video.snippet ?? {};
    const durationSeconds = parseIsoDuration(video.contentDetails?.duration);
    const transcript = cues.length > 0 ? transcriptForPrompt(cues) : null;

    let raw = '';
    try {
      for await (const chunk of provider.answer({
        system: SUGGEST_SYSTEM,
        context: buildSuggestContext({
          platformName: PLATFORM_NAME,
          title: snippet.title ?? '',
          description: snippet.description ?? '',
          tags: snippet.tags ?? [],
          durationSeconds,
          transcript,
        }),
        history: [],
        question: SUGGEST_QUESTION,
        maxOutputTokens: SUGGEST_MAX_TOKENS,
      })) {
        if (chunk.kind === 'refused') break;
        raw += chunk.text;
      }
    } catch (error) {
      // The error, never the prompt — it carries the video's transcript.
      this.logger.warn(`suggestion failed: ${error instanceof Error ? error.message : 'unknown'}`);
      throw new BadGatewayException('the AI provider did not answer');
    }

    const composed = composeSuggestion(raw, { cues, durationSeconds, courseLink });
    if (!composed) throw new BadGatewayException('the AI answer could not be read');
    return { ...composed, source: transcript ? 'captions' : 'title' };
  }

  private async courseLink(courseId: string, videoId: string): Promise<string> {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, status: 'published' },
      select: { slug: true },
    }).catch(() => null);
    if (!course) throw new BadRequestException('unknown course');
    const origin = loadEnv(process.env).APP_URL.replace(/\/$/, '');
    return youtubeCourseLink(`${origin}/courses/${encodeURIComponent(course.slug)}`, videoId);
  }

  /**
   * The captions, when they can be read: `captions.list` (50 units) then
   * `captions.download` (200). Arabic first, auto-generated or not, then
   * whatever exists. ANY failure — no track, a track YouTube will not hand
   * over, a 403 on an auto track — is «no transcript», never an error: the
   * suggestion is still worth having from the title.
   */
  private async captionCues(token: string, videoId: string): Promise<Cue[]> {
    let tracks: RawCaption[];
    try {
      tracks = await this.google.captions(token, videoId);
    } catch (error) {
      if (error instanceof YoutubeApiError && error.status === 401) throw error;
      return [];
    }
    const usable = tracks.filter((track) => track.snippet?.status !== 'failed');
    const rank = (track: RawCaption) => {
      const language = track.snippet?.language ?? '';
      const arabic = language.startsWith('ar') ? 0 : 2;
      const manual = track.snippet?.trackKind === 'asr' ? 1 : 0;
      return arabic + manual;
    };
    const best = [...usable].sort((a, b) => rank(a) - rank(b))[0];
    if (!best) return [];
    try {
      return parseSrt(await this.google.downloadCaption(token, best.id));
    } catch (error) {
      if (error instanceof YoutubeApiError && error.status === 401) throw error;
      return [];
    }
  }
}

/**
 * The snippet `videos.update` is sent: the admin's fields over the current
 * ones, and EVERY writable field present — the guarantee that nothing the
 * form does not show is wiped. Read-only fields (`channelId`, `thumbnails`,
 * `publishedAt`, `localized`…) are left out; YouTube ignores or refuses them.
 */
export function mergeSnippet(
  current: {
    title?: string;
    description?: string;
    tags?: string[];
    categoryId?: string;
    defaultLanguage?: string;
    defaultAudioLanguage?: string;
  },
  input: YoutubeVideoUpdate,
): WritableSnippet {
  const tags = input.tags ?? current.tags;
  return {
    title: input.title ?? current.title ?? '',
    description: input.description ?? current.description ?? '',
    categoryId: input.categoryId ?? current.categoryId ?? '27',
    ...(tags !== undefined ? { tags } : {}),
    ...(current.defaultLanguage ? { defaultLanguage: current.defaultLanguage } : {}),
    ...(current.defaultAudioLanguage ? { defaultAudioLanguage: current.defaultAudioLanguage } : {}),
  };
}

function thumbnail(thumbs: Record<string, { url?: string }> | undefined): string | null {
  if (!thumbs) return null;
  return thumbs['medium']?.url ?? thumbs['high']?.url ?? thumbs['default']?.url ?? null;
}
