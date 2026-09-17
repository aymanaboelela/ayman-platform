import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type Redis from 'ioredis';
import type {
  VideoUploadAbort,
  VideoUploadComplete,
  VideoUploadSession,
  VideoUploadStart,
  VideoUploadStatus,
} from '@ayman/contracts/admin/video-upload';
import { UPLOAD_ID_RE, uploadPartCount, uploadPartSize, uploadSourceKey } from '@ayman/contracts/video';
import { mirrorPrefix } from '@ayman/contracts/video';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { VideoMirrorService } from './video-mirror.service';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * «الرفع المباشر» — opening, sealing and cancelling an upload session
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Three small JSON messages around a transfer this API never touches. The
 * browser sends every byte straight to the bucket with pre-signed URLs; what
 * happens here is the bookkeeping that makes those bytes a lecture.
 */

/**
 * How long the signed part URLs stay valid.
 *
 * Six hours. It has to outlast the slowest upload anyone will genuinely
 * attempt — 8 GB on a 5 Mbit ADSL line is over three hours, and that is a
 * real Egyptian connection, not a worst case — while staying far short of
 * SigV4's seven-day maximum, because each URL is write access to our bucket
 * sitting in a browser tab.
 */
const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;

/**
 * The video this upload is REPLACING, parked while the new one is in flight.
 *
 * The row can only hold one `external_id`, so writing the new one at `start`
 * loses the old — and with it the ability to put the lecture back if the
 * upload is cancelled, or to delete the old ladder's bytes once it is not.
 *
 * Redis rather than a column: it is genuinely temporary state, it expires on
 * its own if a tab is closed and never comes back, and the worst thing losing
 * it can cost is a few piastres of orphaned storage. It can never cost a
 * lecture — the old bytes are deleted only on an explicit successful
 * completion.
 */
const REPLACED_KEY = (videoId: string): string => `ayman:video-upload:replaced:${videoId}`;
const REPLACED_TTL_SECONDS = 24 * 60 * 60;

interface ReplacedVideo {
  externalId: string;
  provider: string;
  durationSeconds: number;
  posterKey: string | null;
  mirrorStatus: string;
  mirrorHeight: number | null;
  sourceName: string | null;
}

@Injectable()
export class VideoUploadService {
  private readonly logger = new Logger(VideoUploadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mirror: VideoMirrorService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /**
   * A fresh upload id: 128 bits of hex.
   *
   * It IS the object key, and the bucket is public by necessity — a student's
   * browser fetches segments from it with no session. So the id is the only
   * thing standing between a lecture and anyone who cares to guess a key, and
   * it is sized accordingly. `randomBytes`, never `Math.random`.
   */
  private newVideoId(): string {
    return randomBytes(16).toString('hex');
  }

  private storage() {
    const storage = this.mirror.objectStorage;
    if (storage === null) {
      // 422 and not 500: nothing is broken, the feature simply is not
      // configured on this deployment, and the admin needs to be told that
      // rather than shown an error page.
      throw new UnprocessableEntityException(
        'الرفع المباشر مش مفعّل على السيرفر ده — لازم يتظبط التخزين الأول',
      );
    }
    return storage;
  }

  /**
   * Open a session: reserve the row, open the multipart upload, sign the parts.
   *
   * The row is written BEFORE a single byte moves, in state `uploading`. That
   * is what makes an abandoned upload visible — a tab closed at 60% leaves a
   * row an admin can see and cancel, rather than parts that are billed and
   * appear in no listing at all.
   */
  async start(lessonId: string, input: VideoUploadStart): Promise<VideoUploadSession> {
    const storage = this.storage();

    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, kind: true },
    });
    if (lesson === null) throw new NotFoundException('الدرس مش موجود');
    if (lesson.kind !== 'video') {
      throw new BadRequestException('الدرس ده مش محاضرة فيديو');
    }

    const videoId = this.newVideoId();
    const key = uploadSourceKey(videoId);

    // Park whatever is there now, so a cancelled upload can put it back and a
    // successful one can free its bytes.
    const previous = await this.prisma.lessonVideo.findUnique({
      where: { lessonId },
      select: {
        externalId: true,
        provider: true,
        durationSeconds: true,
        posterKey: true,
        mirrorStatus: true,
        mirrorHeight: true,
        sourceName: true,
      },
    });
    if (previous !== null) {
      await this.redis
        .set(REPLACED_KEY(videoId), JSON.stringify(previous), 'EX', REPLACED_TTL_SECONDS)
        .catch(() => undefined);
      // An upload session this one supersedes leaves parts behind that are
      // stored and billed and show up in no listing. Cancel it now.
      if (previous.provider === 'upload' && previous.mirrorStatus === 'uploading') {
        await this.abortOrphan(previous.externalId);
      }
    }

    const uploadId = await storage.createMultipart(key, input.contentType);
    const partSizeBytes = uploadPartSize(input.sizeBytes);
    const parts = await storage.presignParts(
      key,
      uploadId,
      uploadPartCount(input.sizeBytes),
      SIGNED_URL_TTL_SECONDS,
    );

    await this.prisma.lessonVideo.upsert({
      where: { lessonId },
      create: {
        lessonId,
        provider: 'upload',
        externalId: videoId,
        // Not known until ffprobe reads the file. Zero is the honest
        // placeholder — the column is NOT NULL and inventing a length here
        // would put a wrong number on the course page for an hour.
        durationSeconds: 0,
        mirrorStatus: 'uploading',
        mirrorProgress: 0,
        sourceBytes: BigInt(input.sizeBytes),
        sourceName: input.fileName,
      },
      update: {
        provider: 'upload',
        externalId: videoId,
        durationSeconds: 0,
        posterKey: null,
        mirrorStatus: 'uploading',
        mirrorHeight: null,
        mirrorBytes: null,
        mirrorError: null,
        mirrorAttempts: 0,
        mirrorAt: null,
        mirrorProgress: 0,
        sourceBytes: BigInt(input.sizeBytes),
        sourceName: input.fileName,
      },
    });

    this.logger.log({ lessonId, videoId, sizeBytes: input.sizeBytes }, 'video upload started');

    return {
      videoId,
      uploadId,
      partSizeBytes,
      parts,
      expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
    };
  }

  /**
   * Seal it. The object becomes real here and the row joins the worker queue.
   *
   * S3 refuses a completion missing any part, so there is no path from here to
   * a truncated file the encoder would faithfully process into a half lecture.
   */
  async complete(lessonId: string, input: VideoUploadComplete): Promise<{ status: string }> {
    const storage = this.storage();
    const row = await this.requireSession(lessonId, input.videoId);

    const key = uploadSourceKey(input.videoId);
    await storage.completeMultipart(key, input.uploadId, input.parts);

    const size = await storage.sizeOf(key);
    if (size === null || size === 0) {
      throw new UnprocessableEntityException('الرفع مخلصش صح — جرّب ترفع الملف تاني');
    }

    await this.prisma.lessonVideo.update({
      where: { lessonId: row.lessonId },
      data: {
        mirrorStatus: 'pending',
        mirrorProgress: 0,
        mirrorAt: null,
        sourceBytes: BigInt(size),
      },
    });

    // The upload succeeded, so the video it replaced is genuinely superseded
    // and its bytes are ours to free. Only now — before this line, they were
    // the lesson's only playable copy.
    await this.freeReplaced(input.videoId);

    this.logger.log({ lessonId, videoId: input.videoId, size }, 'video upload complete');
    return { status: 'pending' };
  }

  /**
   * «إلغاء» — throw the parts away and put back whatever was there.
   *
   * Restoring the previous video is the half that is easy to forget and the
   * half that matters: without it, an instructor who starts replacing a
   * lecture and changes their mind has deleted it.
   */
  async abort(lessonId: string, input: VideoUploadAbort): Promise<{ status: string }> {
    const storage = this.storage();
    const row = await this.requireSession(lessonId, input.videoId);

    await storage.abortMultipart(uploadSourceKey(input.videoId), input.uploadId);

    const parked = await this.redis.get(REPLACED_KEY(input.videoId)).catch(() => null);
    if (parked !== null) {
      const previous = JSON.parse(parked) as ReplacedVideo;
      await this.prisma.lessonVideo.update({
        where: { lessonId: row.lessonId },
        data: {
          provider: previous.provider as 'youtube' | 'upload',
          externalId: previous.externalId,
          durationSeconds: previous.durationSeconds,
          posterKey: previous.posterKey,
          mirrorStatus: previous.mirrorStatus as 'ready' | 'pending' | 'failed' | 'disabled',
          mirrorHeight: previous.mirrorHeight,
          mirrorProgress: null,
          sourceName: previous.sourceName,
        },
      });
      await this.redis.del(REPLACED_KEY(input.videoId)).catch(() => undefined);
      return { status: 'restored' };
    }

    // Nothing to put back — the lesson had no video before this attempt.
    await this.prisma.lessonVideo.delete({ where: { lessonId: row.lessonId } }).catch(() => undefined);
    return { status: 'removed' };
  }

  /** What the admin screen polls while the encode runs. */
  async status(lessonId: string): Promise<VideoUploadStatus> {
    const row = await this.prisma.lessonVideo.findUnique({
      where: { lessonId },
      select: {
        mirrorStatus: true,
        mirrorProgress: true,
        mirrorHeight: true,
        mirrorBytes: true,
        mirrorError: true,
        durationSeconds: true,
      },
    });
    if (row === null) throw new NotFoundException('الدرس ده مالوش فيديو');

    return {
      status: row.mirrorStatus,
      progress: row.mirrorProgress,
      // Zero is the placeholder written at `start`; reporting it as a real
      // duration would put «٠٠:٠٠» on the lecture until the encode finished.
      durationSeconds: row.durationSeconds > 0 ? row.durationSeconds : null,
      maxHeight: row.mirrorHeight,
      sizeBytes: row.mirrorBytes === null ? null : Number(row.mirrorBytes),
      error: row.mirrorError,
    };
  }

  /**
   * The row must exist, belong to this lesson, and be the session the caller
   * names. Anything else is a stale tab — two admins on the same lesson, or a
   * retry after the session was replaced — and completing it would seal an
   * upload into a row that has moved on.
   */
  private async requireSession(lessonId: string, videoId: string) {
    if (!UPLOAD_ID_RE.test(videoId)) throw new BadRequestException('رقم الرفع مش مظبوط');

    const row = await this.prisma.lessonVideo.findUnique({
      where: { lessonId },
      select: { lessonId: true, externalId: true, mirrorStatus: true },
    });
    if (row === null || row.externalId !== videoId) {
      throw new NotFoundException('الرفع ده مش موجود — يمكن يكون اتلغى أو اتبدل');
    }
    if (row.mirrorStatus !== 'uploading') {
      throw new BadRequestException('الرفع ده خلص خلاص');
    }
    return row;
  }

  /** Delete the ladder of a video a completed upload has replaced. */
  private async freeReplaced(videoId: string): Promise<void> {
    const parked = await this.redis.get(REPLACED_KEY(videoId)).catch(() => null);
    if (parked === null) return;

    const previous = JSON.parse(parked) as ReplacedVideo;
    await this.redis.del(REPLACED_KEY(videoId)).catch(() => undefined);

    /*
     * ⚠️ A YouTube mirror's bytes are keyed by the YOUTUBE id, and the same
     * video may be attached to another lesson. Deleting that prefix here
     * would take the other lesson's copy with it. Upload ids are unique to
     * one upload, so only those are safe to free.
     */
    if (previous.provider !== 'upload') return;

    const stillUsed = await this.prisma.lessonVideo.count({
      where: { externalId: previous.externalId },
    });
    if (stillUsed > 0) return;

    const storage = this.mirror.objectStorage;
    if (storage === null) return;
    await storage.deletePrefix(mirrorPrefix(previous.externalId)).catch(() => undefined);
    await storage.deleteObject(uploadSourceKey(previous.externalId)).catch(() => undefined);
  }

  /**
   * An upload session that was superseded before it finished. Its parts are
   * stored and billed and appear in no bucket listing, so they have to be
   * cancelled explicitly — but S3 needs the multipart id to do it, and we no
   * longer have it. Deleting the source key is what we can do; the parts
   * themselves are left to the bucket's own multipart lifecycle rule.
   */
  private async abortOrphan(videoId: string): Promise<void> {
    const storage = this.mirror.objectStorage;
    if (storage === null || !UPLOAD_ID_RE.test(videoId)) return;
    await storage.deleteObject(uploadSourceKey(videoId)).catch(() => undefined);
  }
}
