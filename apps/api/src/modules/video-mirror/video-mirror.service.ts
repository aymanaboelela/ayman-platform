import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Inject, Injectable, Logger, Optional, type OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type Redis from 'ioredis';
import { MIRROR_MAX_ATTEMPTS, mirrorPrefix, uploadSourceKey } from '@ayman/contracts/video';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { loadEnv } from '../../config/env';
import { mirrorConfigFrom, type MirrorConfig } from './mirror-config';
import { MirrorStorage } from './mirror-storage';
import { DEFAULT_TOOLS, mirrorVideo, type MirrorTools } from './mirror-pipeline';
import {
  DEFAULT_TRANSCODE_TOOLS,
  transcodeUpload,
  type TranscodeTools,
} from './upload-pipeline';

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

/** The encoder's own knobs. Optional for the same reason as MIRROR_TOOLS. */
export const TRANSCODE_TOOLS = Symbol('TRANSCODE_TOOLS');

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
    @Optional()
    @Inject(TRANSCODE_TOOLS)
    private readonly encoder: TranscodeTools = DEFAULT_TRANSCODE_TOOLS,
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

  /**
   * The bucket, for `VideoUploadService` — which signs the browser's part
   * URLs and therefore needs the same client, the same credentials and the
   * same all-or-nothing config this service already resolved.
   *
   * Read-only and same-module: nothing outside `video-mirror` imports it, and
   * a caller that wanted to would be reaching past the two services that own
   * every key in the bucket.
   */
  get objectStorage(): MirrorStorage | null {
    return this.storage;
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

    /*
     * BOTH pipelines draw from this one queue.
     *
     * `provider` is no longer pinned to `youtube`: an uploaded lecture is the
     * same row in the same three states, and giving it a second worker would
     * mean two of them encoding at once on a VPS that can barely afford one.
     * The dispatch is on the claimed row's provider, below.
     *
     * `uploading` is absent from every branch and that is the point — the
     * bytes are still arriving from the admin's browser and there is nothing
     * yet to package.
     */
    const claimed = await this.prisma.lessonVideo.findFirst({
      where: {
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
      select: {
        lessonId: true,
        externalId: true,
        provider: true,
        mirrorAttempts: true,
        mirrorStatus: true,
      },
    });

    if (claimed === null) {
      await this.adoptSweep();
      return;
    }

    await this.prisma.lessonVideo.update({
      where: { lessonId: claimed.lessonId },
      data: { mirrorStatus: 'mirroring', mirrorAt: new Date(), mirrorProgress: 0 },
    });

    try {
      if (claimed.provider === 'upload') await this.transcodeOne(claimed.externalId);
      else await this.mirrorOne(claimed.externalId);

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
          mirrorProgress: null,
        },
      });

      this.logger.warn(
        { externalId: claimed.externalId, provider: claimed.provider, attempts, err: error },
        'video mirror failed',
      );
    }
  }

  /**
   * ── Rows the queue can no longer reach ─────────────────────────────────
   *
   * `mirrorOne` adopts a ladder the bucket already holds — but only for a row
   * the claim query still returns, and after three consecutive failures it
   * returns none. That ceiling is right when the failures mean YouTube: it
   * stops the worker hammering an address that will keep refusing it.
   *
   * It is wrong for the case that actually happened. Every lecture exhausted
   * its three attempts against the bot check BEFORE the copies existed, so
   * when the backfill finally filled the bucket there was no row left the
   * worker would look at. The fix landed, the bytes were there, and nothing
   * moved — which reads exactly like the fix not working.
   *
   * So: when the queue is empty, ask the bucket what it has and adopt
   * anything whose row is not `ready` yet. One listing, and only for ids that
   * are actually present — the attempts ceiling exists to protect YouTube
   * from us, and this path never calls YouTube at all.
   *
   * Only when the queue is empty: a tick with real work to do should spend
   * its lock on that, and a platform whose rows are all `ready` pays one
   * cheap listing per minute for a sweep that finds nothing.
   */
  private async adoptSweep(): Promise<void> {
    if (this.storage === null) return;

    const mirrored = await this.storage.listMirroredIds();
    if (mirrored.size === 0) return;

    const orphans = await this.prisma.lessonVideo.findMany({
      where: {
        provider: 'youtube',
        externalId: { in: [...mirrored] },
        mirrorStatus: { not: 'ready' },
      },
      select: { externalId: true },
      distinct: ['externalId'],
    });

    for (const orphan of orphans) {
      const ladder = await this.storage.describeLadder(mirrorPrefix(orphan.externalId));
      // A prefix that is not a complete ladder is left alone, not marked
      // failed: an upload still in flight becomes adoptable a minute later.
      if (ladder === null) continue;

      await this.markReady(orphan.externalId, ladder.maxHeight, ladder.bytes);
      this.logger.log(
        { youtubeId: orphan.externalId, maxHeight: ladder.maxHeight, bytes: ladder.bytes },
        'video mirror adopted by sweep — the row had run out of attempts',
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

    /*
     * ── Adopt a copy that is already there ────────────────────────────────
     *
     * Ask the bucket before asking YouTube, because from this machine YouTube
     * is not answerable: a data-centre IP gets «Sign in to confirm you're not
     * a bot» for every Innertube client, on every video, and no retry
     * outlasts an IP reputation. The backfill therefore runs from a
     * residential connection (`scripts/mirror-local.ts`) and leaves a
     * complete ladder here under the same keys this worker would have
     * written.
     *
     * Without this branch those objects are invisible: the row stays
     * `failed`, every player falls back to YouTube, and the ministry tablet —
     * the entire reason this feature exists — still sees a grey box while a
     * perfectly good copy sits in the bucket, paid for, one lookup away.
     *
     * Adoption is also the right answer on the admin's «حاول تاني»: a retry
     * asks for a working mirror, not specifically for a fresh download.
     */
    const existing = await this.storage.describeLadder(prefix);
    if (existing !== null) {
      await this.markReady(youtubeId, existing.maxHeight, existing.bytes);
      this.logger.log(
        { youtubeId, maxHeight: existing.maxHeight, bytes: existing.bytes },
        'video mirror adopted from the bucket — nothing downloaded',
      );
      return;
    }

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

    await this.markReady(youtubeId, result.maxHeight, result.bytes);

    this.logger.log(
      { youtubeId, maxHeight: result.maxHeight, bytes: result.bytes },
      'video mirrored',
    );
  }

  /**
   * Mark every row pointing at this id `ready`.
   *
   * Every row, not just the one that was claimed: the same video attached to
   * two lessons is one copy in the bucket, and both lessons are ready the
   * moment it lands.
   */
  private async markReady(youtubeId: string, maxHeight: number, bytes: number): Promise<void> {
    await this.prisma.lessonVideo.updateMany({
      where: { externalId: youtubeId, provider: 'youtube' },
      data: {
        mirrorStatus: 'ready',
        mirrorHeight: maxHeight,
        mirrorBytes: BigInt(bytes),
        mirrorError: null,
        mirrorAttempts: 0,
        mirrorAt: new Date(),
      },
    });
  }

  /**
   * Package an UPLOADED lecture — the other half of the queue.
   *
   * The shape is deliberately the same as `mirrorOne`: fetch a source,
   * produce a ladder, clear the prefix, upload, mark every row pointing at
   * this id `ready`. What differs is the middle step, and it differs a lot —
   * this is a real encode (see `upload-pipeline.ts`), so it is minutes to
   * tens of minutes rather than seconds, and it holds the lock the whole
   * time. That is intended: one video at a time, at the lowest scheduling
   * priority, so the site does not go sluggish while a lecture is processed.
   *
   * ⚠️ The source is deleted only AFTER the ladder is in the bucket. Deleting
   * it earlier — say, right after ffmpeg — would make a failed upload
   * unrecoverable: there would be nothing left to retry from, and the admin's
   * only remedy would be to send the whole file again.
   */
  async transcodeOne(uploadId: string): Promise<void> {
    if (this.config === null || this.storage === null) {
      throw new Error('video mirror is not configured');
    }

    const storage = this.storage;
    const prefix = mirrorPrefix(uploadId);
    const sourceKey = uploadSourceKey(uploadId);

    const setProgress = async (progress: number): Promise<void> => {
      await this.prisma.lessonVideo
        .updateMany({ where: { externalId: uploadId, provider: 'upload' }, data: { mirrorProgress: progress } })
        .catch(() => undefined);
    };

    const work = await mkdtemp(join(tmpdir(), `upload-${uploadId}-`));
    const sourceFile = join(work, 'source');

    try {
      const size = await storage.sizeOf(sourceKey);
      if (size === null) {
        // The one failure worth naming precisely: the row says the upload
        // finished and the bucket disagrees. Retrying cannot fix it, and the
        // admin needs to be told to send the file again rather than to wait.
        throw new Error('الملف اللي اترفع مش موجود في التخزين — لازم يترفع تاني');
      }

      await setProgress(5);
      await storage.downloadTo(sourceKey, sourceFile);

      await setProgress(15);
      const result = await transcodeUpload(sourceFile, work, this.encoder, (stage) => {
        void setProgress(stage === 'encoding' ? 20 : stage === 'poster' ? 85 : 15);
      });

      try {
        await setProgress(90);
        // Clear first — a re-encode whose ladder lost a rung would otherwise
        // leave the old rung's segments unreferenced, paid for, and still
        // reachable by anyone holding the previous playlist.
        await storage.deletePrefix(prefix);
        await storage.uploadLadder(result.dir, result.files, prefix);
      } finally {
        await result.cleanup();
      }

      // Only now. Until this line the original is the only copy of the
      // lecture that exists outside the instructor's laptop.
      await storage.deleteObject(sourceKey);

      await this.prisma.lessonVideo.updateMany({
        where: { externalId: uploadId, provider: 'upload' },
        data: {
          mirrorStatus: 'ready',
          mirrorHeight: result.maxHeight,
          mirrorBytes: BigInt(result.bytes),
          mirrorError: null,
          mirrorAttempts: 0,
          mirrorAt: new Date(),
          mirrorProgress: 100,
          sourceBytes: BigInt(size),
          // The duration comes from the FILE, which is the only thing that
          // knows it. Nobody types it and nothing is asked about it.
          durationSeconds: result.durationSeconds,
        },
      });

      this.logger.log(
        { uploadId, maxHeight: result.maxHeight, bytes: result.bytes, sourceBytes: size },
        'uploaded video packaged',
      );
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => undefined);
    }
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
        mirrorProgress: null,
      },
    });
  }
}
