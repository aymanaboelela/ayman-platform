import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { isFeatureEnabled } from '../../common/entitlements';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { YoutubeApiClient, YoutubeApiError, type SeenUpload } from './youtube-api.client';
import { YoutubeConnectionService } from './youtube-connection.service';

/** The newest uploads looked at per run. One call either way; ten covers a busy day twice over. */
const WATCH_PAGE = 10;

/**
 * «نزل فيديو جديد» — notices uploads the platform has not seen yet.
 *
 * ## What one run costs
 *
 * One `playlistItems` call on the uploads playlist: **1 quota unit**, every
 * half hour, 48 a day out of a project's 10,000 — and the project is shared
 * with other tools. It never reads captions, never pages, and never runs on a
 * stack without `youtubeStudio` or without a connected channel.
 *
 * ## Uploads stay in YouTube Studio
 *
 * There is deliberately no `videos.insert` anywhere in this module. A Google
 * Cloud project that has not passed YouTube's API compliance audit gets every
 * API upload LOCKED to private. So the teacher uploads where they always did,
 * and this watcher is how the platform finds out and takes over from there.
 *
 * ## Baseline, not a flood
 *
 * The first sighting of a channel records what is already there as NOT new.
 * Connecting a channel with 300 videos announces nothing; the 301st does.
 */
@Injectable()
export class YoutubeWatchService {
  private readonly logger = new Logger(YoutubeWatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connection: YoutubeConnectionService,
    private readonly google: YoutubeApiClient,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('17,47 * * * *')
  async scheduledWatch(): Promise<void> {
    if (!isFeatureEnabled('youtubeStudio')) return;
    try {
      const fresh = await this.watch();
      if (fresh > 0) this.logger.log(`${fresh} new YouTube upload(s)`);
    } catch (error) {
      // Quota out or Google down: the next run tries again; nothing to page anyone about.
      const quiet = error instanceof YoutubeApiError && error.quotaExceeded;
      const message = `youtube watch skipped: ${error instanceof Error ? error.message : 'unknown'}`;
      if (quiet) this.logger.debug(message);
      else this.logger.warn(message);
    }
  }

  /** One look at the newest uploads. Answers how many were new. */
  async watch(): Promise<number> {
    if (!this.connection.client()) return 0;
    const channel = await this.connection.channel();
    if (!channel) return 0;
    const playlist = channel.uploadsPlaylistId ?? `UU${channel.id.slice(2)}`;
    const uploads = await this.connection.withAccess((token) => this.google.recentUploads(token, playlist, WATCH_PAGE));
    return (await this.record(channel.id, uploads)).length;
  }

  /**
   * Records `uploads` as seen, and notifies the connecting admin about the
   * ones that are genuinely new. Shared with the list's first page, which
   * already holds the same facts — so opening the screen notices a new video
   * for free, without waiting for the half-hour.
   *
   * Row by row with `create`, not `createMany`: the watcher and a page load
   * can see the same upload at the same moment, and only the one whose insert
   * WINS may notify, or the admin gets told twice.
   */
  async record(channelId: string, uploads: readonly SeenUpload[]): Promise<string[]> {
    if (uploads.length === 0) return [];
    const ids = uploads.map((upload) => upload.id);
    const [known, seenBefore] = await Promise.all([
      this.prisma.youtubeVideo.findMany({ where: { videoId: { in: ids } }, select: { videoId: true, title: true } }),
      this.prisma.youtubeVideo.count({ where: { channelId } }),
    ]);
    const titles = new Map(known.map((row) => [row.videoId, row.title]));
    const baseline = seenBefore === 0;

    const fresh: string[] = [];
    for (const upload of uploads) {
      if (!/^[A-Za-z0-9_-]{11}$/.test(upload.id)) continue;
      const knownTitle = titles.get(upload.id);
      if (knownTitle !== undefined) {
        // Renamed in YouTube Studio: keep the notification's title current.
        if (upload.title && knownTitle !== upload.title) {
          await this.prisma.youtubeVideo.update({ where: { videoId: upload.id }, data: { title: upload.title } });
        }
        continue;
      }
      try {
        await this.prisma.youtubeVideo.create({
          data: {
            videoId: upload.id,
            channelId,
            title: upload.title,
            thumbnailUrl: upload.thumbnailUrl,
            publishedAt: upload.publishedAt ? new Date(upload.publishedAt) : null,
            isNew: !baseline,
          },
        });
        if (!baseline) fresh.push(upload.id);
      } catch {
        // Someone else's insert won — theirs notifies.
      }
    }
    if (fresh.length > 0) await this.notify(fresh);
    return fresh;
  }

  /**
   * ONE recipient: the admin who connected the channel. The platform's usual
   * fan-out (`emitToPermission`) writes a row for every staff account, and a
   * channel is one person's to tend.
   */
  private async notify(videoIds: readonly string[]): Promise<void> {
    const row = await this.prisma.youtubeConnection.findUnique({ where: { id: 1 }, select: { connectedBy: true } });
    const userId = row?.connectedBy;
    if (!userId) return;
    try {
      await this.prisma.$transaction(async (tx) => {
        for (const videoId of videoIds) {
          await this.notifications.emit(tx, { userId, kind: 'youtube_new_video', videoId });
        }
      });
      await this.notifications.announce(userId);
    } catch (error) {
      // The «جديد» badge is the record; a missed bell is not worth failing the watch over.
      this.logger.warn(`youtube new-video notification failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }
}
