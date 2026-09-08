import { Inject, Injectable, Logger, Optional, type OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type Redis from 'ioredis';
import { MIRROR_MAX_ATTEMPTS, mirrorPrefix } from '@ayman/contracts/video';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { loadEnv } from '../../config/env';
import { mirrorConfigFrom, type MirrorConfig } from './mirror-config';
import { MirrorStorage } from './mirror-storage';
import { DEFAULT_TOOLS, mirrorVideo, type MirrorTools } from './mirror-pipeline';

/** One mirror at a time across the platform, however many API replicas exist. */
const LOCK_KEY = 'ayman:video-mirror:worker';

/**
 * Injection token for the two binaries.
 *
 * Optional, so nothing has to provide it in production — but a spec can, and
 * that is what lets the worker's state machine (claim → mirroring → ready,
 * the backoff, the reaper) be tested against a stub pair in milliseconds
 * instead of only against YouTube.
 */
export const MIRROR_TOOLS = Symbol('MIRROR_TOOLS');

/**
 * Short TTL, renewed while the work runs.
 *
 * The obvious alternative — a TTL long enough for the longest download — means
 * a crashed worker holds the queue for half an hour. Renewing every fifteen
 * seconds instead makes the recovery time the TTL rather than the timeout,
 * and a process that dies mid-download frees the queue in ninety seconds.
 */
const LOCK_TTL_MS = 90_000;
const LOCK_RENEW_MS = 15_000;

/** How long a claimed row may sit in `mirroring` before another worker takes it. */
const STALE_CLAIM_MS = 45 * 60_000;

/** Wait after a failure before trying again. Attempt-linear, not exponential —
 *  three attempts never spans more than an hour, so a transient YouTube error
 *  on a Friday does not leave a lecture unmirrored until Sunday. */
const RETRY_BACKOFF_MS = 20 * 60_000;

@Injectable()
export class VideoMirrorService implements OnModuleDestroy {
  private readonly logger = new Logger(VideoMirrorService.name);
  private readonly config: MirrorConfig | null;
  private readonly storage: MirrorStorage | null;
  private running = false;
  private renewTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    @Optional() @Inject(MIRROR_TOOLS) private readonly tools: MirrorTools = DEFAULT_TOOLS,
  ) {
    this.config = mirrorConfigFrom(loadEnv(process.env));
    this.storage = this.config === null ? null : new MirrorStorage(this.config);

    if (this.config === null) {
      this.logger.log('video mirror disabled — no bucket configured, players fall back to YouTube');
    }
  }

  /** True when a bucket is configured. Read by the player and admin services. */
  get enabled(): boolean {
    return this.config !== null;
  }

  /** The public origin, or null. The player needs it to build playlist URLs. */
  get publicUrl(): string | null {
    return this.config?.publicUrl ?? null;
  }

  onModuleDestroy(): void {
    if (this.renewTimer !== null) clearInterval(this.renewTimer);
  }

  /**
   * Every minute, not every ten seconds like the marketing runner: a tick that
   * finds nothing costs a query, and a tick that finds something is going to
   * be busy for minutes anyway. There is nothing here a student is waiting on
   * in real time.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (this.config === null || this.storage === null) return;
    // A tick that overlaps its predecessor inside ONE process would take the
    // lock straight back off itself — the Redis lock guards replicas, this
    // guards the event loop.
    if (this.running) return;

    let held = false;
    try {
      held = (await this.redis.set(LOCK_KEY, '1', 'PX', LOCK_TTL_MS, 'NX')) === 'OK';
    } catch (error) {
      // Fail closed, exactly as the marketing runner does. A skipped tick
      // costs a minute; two workers pulling the same gigabyte costs the
      // uplink the API answers requests on.
      this.logger.warn({ err: error }, 'video mirror could not take its lock');
      return;
    }
    if (!held) return;

    this.running = true;
    this.renewTimer = setInterval(() => {
      this.redis.pexpire(LOCK_KEY, LOCK_TTL_MS).catch(() => undefined);
    }, LOCK_RENEW_MS);

    try {
      await this.step();
    } catch (error) {
      this.logger.error({ err: error }, 'video mirror tick failed');
    } finally {
      if (this.renewTimer !== null) clearInterval(this.renewTimer);
      this.renewTimer = null;
      this.running = false;
      await this.redis.del(LOCK_KEY).catch(() => undefined);
    }
  }

  /** One video, start to finish, or nothing. */
  private async step(): Promise<void> {
    const now = new Date();

    const claimed = await this.prisma.lessonVideo.findFirst({
      where: {
        provider: 'youtube',
        OR: [
          { mirrorStatus: 'pending' },
          {
            mirrorStatus: 'failed',
            mirrorAttempts: { lt: MIRROR_MAX_ATTEMPTS },
            mirrorAt: { lt: new Date(now.getTime() - RETRY_BACKOFF_MS) },
          },
          // The reaper. A worker killed mid-download leaves a row nothing else
          // would ever look at again — `mirroring` is not a state anything
          // else queries — and the lecture stays dark forever with a status
          // that reads like progress.
          {
            mirrorStatus: 'mirroring',
            mirrorAt: { lt: new Date(now.getTime() - STALE_CLAIM_MS) },
          },
        ],
      },
      orderBy: [{ mirrorAt: { sort: 'asc', nulls: 'first' } }],
      select: { lessonId: true, externalId: true, mirrorAttempts: true, mirrorStatus: true },
    });

    if (claimed === null) return;

    await this.prisma.lessonVideo.update({
      where: { lessonId: claimed.lessonId },
      data: { mirrorStatus: 'mirroring', mirrorAt: new Date() },
    });

    try {
      await this.mirrorOne(claimed.externalId);

      // Recorded from the run, not from the row: `mirrorOne` returns what it
      // actually uploaded, which is not always the ladder we hoped for.
    } catch (error) {
      const attempts = claimed.mirrorAttempts + 1;
      const message = error instanceof Error ? error.message : String(error);

      await this.prisma.lessonVideo.update({
        where: { lessonId: claimed.lessonId },
        data: {
          mirrorStatus: 'failed',
          mirrorAttempts: attempts,
          // Truncated: this string is rendered in the admin table, and
          // yt-dlp's longer errors carry a full URL and a stack.
          mirrorError: message.slice(0, 500),
          mirrorAt: new Date(),
        },
      });

      this.logger.warn(
        { youtubeId: claimed.externalId, attempts, err: error },
        'video mirror failed',
      );
    }
  }

  /**
   * Download, package, upload, and record — for one video id.
   *
   * Public so the admin retry endpoint can drive it, and so a spec can run it
   * against a stub tool pair without waiting on a cron.
   */
  async mirrorOne(youtubeId: string): Promise<void> {
    if (this.config === null || this.storage === null) {
      throw new Error('video mirror is not configured');
    }

    const prefix = mirrorPrefix(youtubeId);
    const result = await mirrorVideo(youtubeId, this.tools);

    try {
      // Clear first. A re-mirror whose ladder lost a rung would otherwise
      // leave the old rung's segments in the bucket, unreferenced and paid
      // for, and — worse — reachable by anyone who had the old playlist.
      await this.storage.deletePrefix(prefix);
      await this.storage.uploadLadder(result.dir, result.files, prefix);
    } finally {
      await result.cleanup();
    }

    // Every row pointing at this id, not just the one that was claimed: the
    // same video attached to two lessons is one copy in the bucket, and both
    // lessons are ready the moment it lands.
    await this.prisma.lessonVideo.updateMany({
      where: { externalId: youtubeId, provider: 'youtube' },
      data: {
        mirrorStatus: 'ready',
        mirrorHeight: result.maxHeight,
        mirrorBytes: BigInt(result.bytes),
        mirrorError: null,
        mirrorAttempts: 0,
        mirrorAt: new Date(),
      },
    });

    this.logger.log(
      { youtubeId, maxHeight: result.maxHeight, bytes: result.bytes },
      'video mirrored',
    );
  }

  /**
   * Put a video back in the queue. Called when an admin presses retry, and
   * whenever a lesson's video id changes — a new id is a different video and
   * the old mirror is not it.
   */
  async requeue(lessonId: string): Promise<void> {
    await this.prisma.lessonVideo.updateMany({
      where: { lessonId },
      data: {
        mirrorStatus: 'pending',
        mirrorHeight: null,
        mirrorAttempts: 0,
        mirrorError: null,
        mirrorAt: null,
      },
    });
  }
}
