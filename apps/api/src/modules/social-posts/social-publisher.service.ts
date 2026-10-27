import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuditService } from '../../audit/audit.service';
import { isFeatureEnabled } from '../../common/entitlements';
import { MEDIA_URL_RESOLVER, type MediaUrlResolver } from '../../common/media/media-url';
import { PrismaService } from '../../prisma/prisma.service';
import { GraphApiError, MetaGraphClient, type PublishedRef } from './meta-graph.client';
import { SocialConnectionService, type PublishTarget } from './social-connection.service';

/** The cron gives up on a post after this many failed publishes; «نشر دلوقتي» resets it. */
export const MAX_AUTO_ATTEMPTS = 3;

/** A publish holds its row this long at most. A crash mid-publish frees the row by itself. */
const LEASE_MS = 5 * 60_000;

/** Posts per cron tick — Graph calls are slow, and one tick must finish inside the minute. */
const DUE_PER_TICK = 5;

export const SOCIAL_POST_RESOURCE = 'social_posts';

export interface PublishablePost {
  id: string;
  format: string;
  caption: string;
  imageKey: string | null;
  imageFormat: string | null;
  facebookPostId: string | null;
  instagramMediaId: string | null;
}

export interface ChannelOutcome {
  facebook: PublishedRef | null;
  instagram: PublishedRef | null;
  /** Every channel this target has is now out — the post may be marked published. */
  complete: boolean;
  error: string | null;
}

/**
 * Publishes one post to every channel the target has, SKIPPING a channel
 * that already holds an id from an earlier attempt.
 *
 * That skip is the whole retry story: Facebook succeeding and Instagram
 * failing must not post to the Page twice when the admin presses «نشر
 * دلوقتي» again. Each channel's id is stored the moment it exists, so the
 * second press finishes the job instead of repeating it.
 */
export async function publishToChannels(
  graph: MetaGraphClient,
  post: PublishablePost,
  imageUrl: string,
  target: PublishTarget,
): Promise<ChannelOutcome> {
  const story = post.format === 'story';
  let facebook: PublishedRef | null = null;
  let instagram: PublishedRef | null = null;
  const errors: string[] = [];

  if (target.pageId && !post.facebookPostId) {
    try {
      facebook = story
        ? await graph.facebookStory({ pageId: target.pageId, token: target.token, imageUrl })
        : await graph.facebookPhoto({ pageId: target.pageId, token: target.token, imageUrl, caption: post.caption });
    } catch (error) {
      errors.push(`Facebook: ${error instanceof GraphApiError ? error.message : 'failed'}`);
    }
  }

  if (target.instagramUserId && !post.instagramMediaId) {
    try {
      instagram = await graph.instagramMedia({
        igUserId: target.instagramUserId,
        token: target.token,
        imageUrl,
        caption: post.caption,
        story,
      });
    } catch (error) {
      errors.push(`Instagram: ${error instanceof GraphApiError ? error.message : 'failed'}`);
    }
  }

  const facebookDone = !target.pageId || Boolean(post.facebookPostId) || facebook !== null;
  const instagramDone = !target.instagramUserId || Boolean(post.instagramMediaId) || instagram !== null;
  return {
    facebook,
    instagram,
    complete: facebookDone && instagramDone,
    error: errors.length > 0 ? errors.join(' · ').slice(0, 500) : null,
  };
}

/**
 * «نشر دلوقتي» and the scheduled posts' cron — one path for both, so a
 * scheduled post is published by exactly the code the button runs.
 */
@Injectable()
export class SocialPublisherService {
  private readonly logger = new Logger(SocialPublisherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly connection: SocialConnectionService,
    private readonly graph: MetaGraphClient,
    @Inject(MEDIA_URL_RESOLVER) private readonly media: MediaUrlResolver,
  ) {}

  /**
   * Publishes `id` through the Graph API. `manual` is the button (it resets
   * the failure count the cron stops at); the cron passes `false`.
   *
   * The lease is taken with a conditional UPDATE, so the button pressed while
   * the cron is mid-publish on the same post gets a 409 instead of a second
   * post on the Page.
   */
  async publish(id: string, options: { manual: boolean }): Promise<void> {
    const target = await this.connection.target();
    if (!target) throw new ConflictException('social accounts are not connected');

    const now = new Date();
    const claimed = await this.prisma.socialPost.updateMany({
      where: {
        id,
        status: { in: ['draft', 'scheduled'] },
        OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(now.getTime() - LEASE_MS) } }],
      },
      data: { lockedAt: now },
    });
    if (claimed.count === 0) {
      const exists = await this.prisma.socialPost.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new NotFoundException();
      throw new ConflictException('post is already published or being published');
    }

    try {
      const post = await this.prisma.socialPost.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          format: true,
          caption: true,
          imageKey: true,
          imageFormat: true,
          facebookPostId: true,
          instagramMediaId: true,
          attempts: true,
        },
      });
      if (!post.imageKey || post.imageFormat !== post.format) {
        throw new ConflictException('post image is missing or out of date');
      }

      const outcome = await publishToChannels(this.graph, post, this.media.resolve(post.imageKey), target);

      await this.prisma.socialPost.update({
        where: { id },
        data: {
          ...(outcome.facebook ? { facebookPostId: outcome.facebook.id, facebookPermalink: outcome.facebook.permalink } : {}),
          ...(outcome.instagram
            ? { instagramMediaId: outcome.instagram.id, instagramPermalink: outcome.instagram.permalink }
            : {}),
          ...(outcome.complete
            ? { status: 'published', publishedAt: new Date(), publishMode: 'api', lastError: null }
            : { lastError: outcome.error, attempts: options.manual ? 1 : post.attempts + 1 }),
          lockedAt: null,
        },
      });

      await this.audit.record({
        action: 'social:publish',
        resourceType: SOCIAL_POST_RESOURCE,
        resourceId: id,
        outcome: outcome.complete ? 'success' : 'failure',
        metadata: {
          mode: 'api',
          trigger: options.manual ? 'button' : 'schedule',
          facebookPostId: outcome.facebook?.id ?? post.facebookPostId,
          instagramMediaId: outcome.instagram?.id ?? post.instagramMediaId,
          error: outcome.error,
        },
      });
    } catch (error) {
      await this.prisma.socialPost.update({ where: { id }, data: { lockedAt: null } });
      throw error;
    }
  }

  /** The scheduled posts whose time has come, a few per minute. */
  @Cron(CronExpression.EVERY_MINUTE)
  async publishDue(now: Date = new Date()): Promise<number> {
    if (!isFeatureEnabled('socialPosts')) return 0;
    if (!(await this.connection.target())) return 0;

    const due = await this.prisma.socialPost.findMany({
      where: {
        status: 'scheduled',
        scheduledAt: { lte: now },
        attempts: { lt: MAX_AUTO_ATTEMPTS },
        imageKey: { not: null },
        OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(now.getTime() - LEASE_MS) } }],
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: DUE_PER_TICK,
      select: { id: true },
    });

    let published = 0;
    for (const { id } of due) {
      try {
        await this.publish(id, { manual: false });
        published += 1;
      } catch (error) {
        // A 409 here is the button winning the race, which is fine. Anything
        // else is logged without the post's caption or the token.
        if (!(error instanceof ConflictException)) {
          this.logger.warn(`scheduled social post ${id} failed: ${error instanceof Error ? error.message : 'unknown'}`);
        }
      }
    }
    return published;
  }
}
