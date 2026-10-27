import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { copy } from '@ayman/contracts/copy';
import { composeCaption, type CaptionContext } from '@ayman/contracts/social/caption';
import {
  MAX_SOCIAL_IMAGE_BYTES,
  SocialFactsSchema,
  SocialPostFormatSchema,
  type SocialMarkPublished,
  type SocialPost,
  type SocialPostList,
  type SocialPostListQuery,
  type SocialPostPatch,
  type SocialScanResult,
} from '@ayman/contracts/social/posts';
import type { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../../audit/audit.service';
import { currentActor } from '../../audit/audit-context';
import { isFeatureEnabled } from '../../common/entitlements';
import { MEDIA_URL_RESOLVER, type MediaUrlResolver } from '../../common/media/media-url';
import { TEACHES_CODE, tenantName } from '../../common/tenant';
import { loadEnv } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { withEncodeSlot } from '../designs/design-encode';
import { FileSignatureService } from '../media/file-signature.service';
import { MEDIA_STORAGE, type MediaStorage } from '../media/storage/media-storage';
import { SocialConnectionService } from './social-connection.service';
import { encodeSocialImage, SOCIAL_IMAGE_MIME } from './social-image';
import { SOCIAL_POST_RESOURCE, SocialPublisherService } from './social-publisher.service';
import { freshCandidates } from './social-sources';
import { SocialSourcesService } from './social-sources.service';

/** Our ids are uuids; anything else is a 404, never a Postgres cast error. */
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The inbox shows this many drafts; older ones are still there, one skip away. */
const INBOX_LIMIT = 60;

export interface UploadFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

const POST_SELECT = {
  id: true,
  kind: true,
  status: true,
  facts: true,
  caption: true,
  link: true,
  format: true,
  imageKey: true,
  imageFormat: true,
  scheduledAt: true,
  publishedAt: true,
  publishMode: true,
  facebookPostId: true,
  facebookPermalink: true,
  instagramMediaId: true,
  instagramPermalink: true,
  lastError: true,
  attempts: true,
  createdAt: true,
} satisfies Prisma.SocialPostSelect;

type PostRow = Prisma.SocialPostGetPayload<{ select: typeof POST_SELECT }>;

function assertId(id: string): void {
  if (!ID.test(id)) throw new NotFoundException();
}

/**
 * «استوديو البوستات» — the drafts, the calendar, and what the admin does to
 * a post. Publishing itself is `SocialPublisherService`; finding events is
 * `SocialSourcesService`.
 */
@Injectable()
export class SocialPostsService {
  private readonly logger = new Logger(SocialPostsService.name);
  private appUrlCache: string | null = null;

  /** Read on first use, like `FollowUpService`: `main.ts` has already validated the env by then. */
  private get appUrl(): string {
    this.appUrlCache ??= loadEnv(process.env).APP_URL.replace(/\/+$/, '');
    return this.appUrlCache;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sources: SocialSourcesService,
    private readonly connection: SocialConnectionService,
    private readonly publisher: SocialPublisherService,
    private readonly signature: FileSignatureService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(MEDIA_URL_RESOLVER) private readonly media: MediaUrlResolver,
  ) {}

  /** Platform name and site through the tenant gates — a teacher's stack posts as them. */
  private captionContext(link: string, extraHashtags: string): CaptionContext {
    return {
      platform: tenantName(copy.site.platformName),
      siteUrl: this.appUrl,
      link,
      extraHashtags,
      teachesCode: TEACHES_CODE,
    };
  }

  private toDto(row: PostRow, hashtags: string): SocialPost {
    const facts = SocialFactsSchema.parse(row.facts);
    return {
      id: row.id,
      kind: facts.kind,
      status: row.status as SocialPost['status'],
      facts,
      caption: row.caption,
      suggestedCaption: composeCaption(facts, this.captionContext(row.link, hashtags)),
      link: row.link,
      format: SocialPostFormatSchema.parse(row.format),
      imageUrl: row.imageKey ? this.media.resolve(row.imageKey) : null,
      imageFormat: row.imageFormat ? SocialPostFormatSchema.parse(row.imageFormat) : null,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      publishMode: (row.publishMode as SocialPost['publishMode']) ?? null,
      facebook: { id: row.facebookPostId, permalink: row.facebookPermalink },
      instagram: { id: row.instagramMediaId, permalink: row.instagramPermalink },
      lastError: row.lastError,
      attempts: row.attempts,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async list(query: SocialPostListQuery): Promise<SocialPostList> {
    const from = new Date(query.from);
    const to = new Date(query.to);
    const now = new Date();
    const [settings, drafts, calendar, overdue, grouped, channels] = await Promise.all([
      this.connection.row(),
      this.prisma.socialPost.findMany({
        where: { status: 'draft' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: INBOX_LIMIT,
        select: POST_SELECT,
      }),
      this.prisma.socialPost.findMany({
        where: {
          OR: [
            { status: 'scheduled', scheduledAt: { gte: from, lt: to } },
            { status: 'published', publishedAt: { gte: from, lt: to } },
          ],
        },
        orderBy: [{ scheduledAt: 'asc' }, { publishedAt: 'asc' }, { id: 'asc' }],
        select: POST_SELECT,
      }),
      this.prisma.socialPost.findMany({
        where: { status: 'scheduled', scheduledAt: { lt: now } },
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        take: 30,
        select: POST_SELECT,
      }),
      this.prisma.socialPost.groupBy({ by: ['status'], _count: { _all: true } }),
      this.connection.channels(),
    ]);
    const hashtags = settings?.hashtags ?? '';
    const count = (status: string) => grouped.find((row) => row.status === status)?._count._all ?? 0;

    return {
      drafts: drafts.map((row) => this.toDto(row, hashtags)),
      calendar: calendar.map((row) => this.toDto(row, hashtags)),
      overdue: overdue.map((row) => this.toDto(row, hashtags)),
      counts: {
        draft: count('draft'),
        scheduled: count('scheduled'),
        published: count('published'),
        skipped: count('skipped'),
      },
      connection: channels,
      lastScanAt: settings?.lastScanAt?.toISOString() ?? null,
    };
  }

  async get(id: string): Promise<SocialPost> {
    assertId(id);
    const [row, settings] = await Promise.all([
      this.prisma.socialPost.findUnique({ where: { id }, select: POST_SELECT }),
      this.connection.row(),
    ]);
    if (!row) throw new NotFoundException();
    return this.toDto(row, settings?.hashtags ?? '');
  }

  /**
   * One scan: every source, then only the candidates whose key is new. The
   * insert is `skipDuplicates`, so a second scan racing this one — the cron
   * and the button at the same minute — loses quietly on the UNIQUE index
   * instead of drafting the same event twice.
   *
   * The caption is composed ONCE here and stored; the admin edits that copy.
   */
  async scan(now: Date = new Date()): Promise<SocialScanResult> {
    const candidates = await this.sources.all(now);
    const existing = await this.prisma.socialPost.findMany({
      where: { sourceKey: { in: candidates.map((candidate) => candidate.sourceKey) } },
      select: { sourceKey: true },
    });
    const fresh = freshCandidates(candidates, new Set(existing.map((row) => row.sourceKey)));
    const settings = await this.connection.row();
    const hashtags = settings?.hashtags ?? '';

    const result =
      fresh.length === 0
        ? { count: 0 }
        : await this.prisma.socialPost.createMany({
            data: fresh.map((candidate) => {
              const link = `${this.appUrl}${candidate.path}`;
              return {
                id: randomUUID(),
                sourceKey: candidate.sourceKey,
                kind: candidate.kind,
                facts: candidate.facts as Prisma.InputJsonValue,
                caption: composeCaption(candidate.facts, this.captionContext(link, hashtags)),
                link,
                // Results and the honor board are what students screenshot into a
                // story; content announcements are feed posts.
                format: 'square',
              };
            }),
            skipDuplicates: true,
          });

    await this.connection.markScanned(now);
    return { created: result.count };
  }

  /** Every half hour, on a stack entitled to the studio. */
  @Cron('7,37 * * * *')
  async scheduledScan(): Promise<void> {
    if (!isFeatureEnabled('socialPosts')) return;
    try {
      const { created } = await this.scan();
      if (created > 0) this.logger.log(`drafted ${created} social post(s)`);
    } catch (error) {
      this.logger.warn(`social scan failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  async patch(id: string, input: SocialPostPatch): Promise<SocialPost> {
    assertId(id);
    const row = await this.prisma.socialPost.findUnique({
      where: { id },
      select: { status: true, scheduledAt: true, format: true, imageKey: true },
    });
    if (!row) throw new NotFoundException();
    if (row.status === 'published') throw new ConflictException('a published post cannot be edited');

    const scheduledAt =
      input.scheduledAt === undefined ? row.scheduledAt : input.scheduledAt === null ? null : new Date(input.scheduledAt);
    // Scheduling is a time; a time alone does not schedule a skipped post,
    // and taking the time away puts a scheduled post back in the inbox.
    let status = input.status ?? row.status;
    if (input.status === undefined && input.scheduledAt !== undefined) {
      status = scheduledAt ? 'scheduled' : row.status === 'scheduled' ? 'draft' : row.status;
    }
    if (status === 'scheduled' && !scheduledAt) throw new BadRequestException('a scheduled post needs a time');

    const formatChanged = input.format !== undefined && input.format !== row.format;
    // A picture drawn for the other shape is stale, and a skipped post will
    // never be published: drop the file so neither the cron nor the button
    // can publish a square crop as a story, and nothing public lingers.
    const staleImage = formatChanged || status === 'skipped';

    await this.prisma.socialPost.update({
      where: { id },
      data: {
        ...(input.caption !== undefined ? { caption: input.caption } : {}),
        ...(input.format !== undefined ? { format: input.format } : {}),
        ...(staleImage ? { imageKey: null, imageFormat: null } : {}),
        status,
        // `scheduled` ⇔ a time. The CHECK in the migration says the same.
        scheduledAt: status === 'scheduled' ? scheduledAt : null,
        // A fresh schedule is a fresh chance for the cron.
        ...(input.scheduledAt !== undefined ? { attempts: 0, lastError: null } : {}),
        updatedBy: currentActor().actorUserId,
      },
    });

    if (staleImage && row.imageKey) await this.dropImage(row.imageKey);

    await this.audit.record({
      action: 'social:update',
      resourceType: SOCIAL_POST_RESOURCE,
      resourceId: id,
      outcome: 'success',
      metadata: {
        fields: Object.keys(input),
        status,
        scheduledAt: scheduledAt?.toISOString() ?? null,
      },
    });

    return this.get(id);
  }

  /**
   * The picture the admin's browser drew. Stored under a fresh `sp/<uuid>.jpg`
   * key every time, so the `immutable` public URL of an earlier render is
   * never overwritten in place, and the previous file is removed.
   */
  async uploadImage(id: string, format: string, file: UploadFile): Promise<SocialPost> {
    assertId(id);
    const parsedFormat = SocialPostFormatSchema.safeParse(format);
    if (!parsedFormat.success) throw new BadRequestException('unknown format');
    if (file.size > MAX_SOCIAL_IMAGE_BYTES) throw new PayloadTooLargeException();

    const row = await this.prisma.socialPost.findUnique({ where: { id }, select: { status: true, format: true, imageKey: true } });
    if (!row) throw new NotFoundException();
    if (row.status === 'published' || row.status === 'skipped') throw new ConflictException('post is not editable');
    if (row.format !== parsedFormat.data) throw new ConflictException('image format does not match the post');

    const detected = await this.signature.detect(file.buffer);
    if (!detected || !SOCIAL_IMAGE_MIME.has(detected.mime)) {
      throw new BadRequestException('file contents are not an allowed image type');
    }

    const jpeg = await withEncodeSlot(() => encodeSocialImage(file.buffer, parsedFormat.data));
    const key = `sp/${randomUUID()}.jpg`;
    await this.storage.put(key, jpeg, 'image/jpeg');

    const updated = await this.prisma.socialPost.updateMany({
      where: { id, status: { in: ['draft', 'scheduled'] }, format: parsedFormat.data },
      data: { imageKey: key, imageFormat: parsedFormat.data },
    });
    if (updated.count === 0) {
      await this.dropImage(key);
      throw new ConflictException('post changed while the image uploaded');
    }
    if (row.imageKey) await this.dropImage(row.imageKey);

    return this.get(id);
  }

  async publish(id: string): Promise<SocialPost> {
    assertId(id);
    await this.publisher.publish(id, { manual: true });
    return this.get(id);
  }

  /** The manual path: the admin posted it themselves and says so. */
  async markPublished(id: string, input: SocialMarkPublished): Promise<SocialPost> {
    assertId(id);
    const updated = await this.prisma.socialPost.updateMany({
      where: { id, status: { in: ['draft', 'scheduled'] } },
      data: {
        status: 'published',
        publishedAt: new Date(),
        publishMode: 'manual',
        lastError: null,
        ...(input.permalink ? { facebookPermalink: input.permalink } : {}),
        updatedBy: currentActor().actorUserId,
      },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.socialPost.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new NotFoundException();
      throw new ConflictException('post is already published or skipped');
    }

    await this.audit.record({
      action: 'social:publish',
      resourceType: SOCIAL_POST_RESOURCE,
      resourceId: id,
      outcome: 'success',
      metadata: { mode: 'manual', permalink: input.permalink },
    });

    return this.get(id);
  }

  private async dropImage(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      // An orphaned JPEG is a few hundred KB on disk; failing the edit over it
      // would be worse. Logged so a pattern of them is visible.
      this.logger.warn(`could not delete social image ${key}: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }
}
