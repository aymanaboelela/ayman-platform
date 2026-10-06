import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  ResourceVideoUploadSession,
  ResourceVideoUploadStart,
  VideoUploadAbort,
  VideoUploadComplete,
  VideoUploadResume,
  VideoUploadResumed,
  VideoUploadStatus,
} from '@ayman/contracts/admin/video-upload';
import { UPLOAD_ID_RE, uploadPartCount, uploadPartSize, uploadSourceKey } from '@ayman/contracts/video';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { VideoArchiveService } from './video-archive.service';
import { VideoMirrorService } from './video-mirror.service';
import { SIGNED_URL_TTL_SECONDS, reopenSession } from './video-upload.service';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * «رفع فيديو» جوّه مواد الدرس — the lecture's upload, for a material
 * ══════════════════════════════════════════════════════════════════════════
 *
 * «حل الواجب» shot on camera is the same kind of file as the lecture — hundreds
 * of megabytes from a phone — and it gets the same treatment: parts straight to
 * the bucket, «كمّل الرفع» after a dropped line, the same encoder (H.264
 * passthrough, the 720/480/360 ladder, AES-128 HLS) and the same player.
 *
 * What it does NOT share is the row. A lecture's video is `lesson_videos`,
 * one per lesson; a material is `lesson_resources`, any number per lesson.
 * Nothing in this file reads or writes `lesson_videos`, so an upload into the
 * materials has no way to replace, park or archive the lecture itself.
 *
 * The material row is created when the session OPENS (state `uploading`),
 * with its title. There is no second «save» after the bytes land, which is
 * what lets the admin press «أضف مادة» once and go on working: the corner card
 * finishes the transfer, `complete` hands the row to the worker, and the
 * material is on the lesson whether or not anyone is still on the page.
 */
/**
 * A material id from the URL, checked before Prisma sees it: the column is
 * `@db.Uuid`, and anything else would come back as a 500 rather than a 404.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class ResourceVideoUploadService {
  private readonly logger = new Logger(ResourceVideoUploadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mirror: VideoMirrorService,
    private readonly archive: VideoArchiveService,
    private readonly audit: AuditService,
  ) {}

  private storage() {
    const storage = this.mirror.objectStorage;
    if (storage === null) {
      throw new UnprocessableEntityException(
        'الرفع المباشر مش مفعّل على السيرفر ده — لازم يتظبط التخزين الأول',
      );
    }
    return storage;
  }

  /** 128 bits of hex — it IS the object key on a public bucket. See `VideoUploadService.newVideoId`. */
  private newVideoId(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Open the multipart upload, then write the material row in `uploading`.
   *
   * Multipart FIRST: a failure there leaves no row at all, which is the right
   * answer — a material that says «بيترفع» with nothing to resume would be a
   * row the admin can only delete. The reverse failure (row insert after a
   * multipart opened) leaves parts the bucket's own lifecycle rule reaps.
   */
  async start(lessonId: string, input: ResourceVideoUploadStart): Promise<ResourceVideoUploadSession> {
    const storage = this.storage();

    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, select: { id: true } });
    if (lesson === null) throw new NotFoundException('الدرس مش موجود');

    const videoId = this.newVideoId();
    const key = uploadSourceKey(videoId);
    const uploadId = await storage.createMultipart(key, input.contentType);
    const parts = await storage.presignParts(key, uploadId, uploadPartCount(input.sizeBytes), SIGNED_URL_TTL_SECONDS);

    const last = await this.prisma.lessonResource.findFirst({
      where: { lessonId },
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
      select: { position: true },
    });

    const resource = await this.prisma.lessonResource.create({
      data: {
        lessonId,
        kind: 'video',
        title: input.title,
        description: input.description,
        position: last === null ? 0 : last.position + 1,
        videoProvider: 'upload',
        videoExternalId: videoId,
        mirrorStatus: 'uploading',
        mirrorProgress: 0,
        sourceName: input.fileName,
        sourceBytes: BigInt(input.sizeBytes),
      },
      select: { id: true },
    });

    await this.audit.record({
      action: 'lesson:update',
      resourceType: AUDIT_RESOURCES.lesson,
      resourceId: lessonId,
      outcome: 'success',
      metadata: { operation: 'addResource', resourceId: resource.id, kind: 'video', provider: 'upload', videoId },
    });
    this.logger.log({ lessonId, resourceId: resource.id, videoId, sizeBytes: input.sizeBytes }, 'resource video upload started');

    return {
      resourceId: resource.id,
      videoId,
      uploadId,
      partSizeBytes: uploadPartSize(input.sizeBytes),
      parts,
      expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
    };
  }

  /** «كمّل الرفع» — same file, same row, only the parts the bucket lacks. */
  async resume(resourceId: string, input: VideoUploadResume): Promise<VideoUploadResumed> {
    const storage = this.storage();
    const row = await this.requireSession(resourceId, input.videoId);
    if (row.sourceBytes === null || Number(row.sourceBytes) !== input.sizeBytes) {
      throw new BadRequestException('ده مش نفس الملف اللي كان بيترفع — اختار نفس الملف');
    }
    return reopenSession(storage, input);
  }

  /** Seal it, and hand the row to the worker — `pending` is the queue. */
  async complete(resourceId: string, input: VideoUploadComplete): Promise<{ status: string }> {
    const storage = this.storage();
    await this.requireSession(resourceId, input.videoId);

    const key = uploadSourceKey(input.videoId);
    await storage.completeMultipart(key, input.uploadId, input.parts);
    const size = await storage.sizeOf(key);
    if (size === null || size === 0) {
      throw new UnprocessableEntityException('الرفع مخلصش صح — جرّب ترفع الملف تاني');
    }

    await this.prisma.lessonResource.update({
      where: { id: resourceId },
      data: { mirrorStatus: 'pending', mirrorProgress: 0, mirrorAt: null, sourceBytes: BigInt(size) },
    });
    this.logger.log({ resourceId, videoId: input.videoId, size }, 'resource video upload complete');
    return { status: 'pending' };
  }

  /**
   * «إلغاء» — throw the parts away and the material with them.
   *
   * Unlike the lecture there is nothing to put back: the row was created by
   * this upload and means nothing without it.
   */
  async abort(resourceId: string, input: VideoUploadAbort): Promise<{ status: string }> {
    const storage = this.storage();
    const row = await this.requireSession(resourceId, input.videoId);

    await storage.abortMultipart(uploadSourceKey(input.videoId), input.uploadId).catch(() => undefined);
    await this.prisma.lessonResource.delete({ where: { id: resourceId } });
    await this.archive.purge(input.videoId);

    await this.audit.record({
      action: 'lesson:update',
      resourceType: AUDIT_RESOURCES.lesson,
      resourceId: row.lessonId,
      outcome: 'success',
      metadata: { operation: 'removeResource', resourceId, reason: 'uploadAborted' },
    });
    return { status: 'removed' };
  }

  /** What the materials panel polls while the encoder works. */
  async status(resourceId: string): Promise<VideoUploadStatus> {
    if (!UUID_RE.test(resourceId)) throw new NotFoundException('المادة دي مش فيديو مرفوع');
    const row = await this.prisma.lessonResource.findUnique({
      where: { id: resourceId },
      select: {
        videoProvider: true,
        mirrorStatus: true,
        mirrorProgress: true,
        mirrorHeight: true,
        mirrorBytes: true,
        mirrorError: true,
        durationSeconds: true,
      },
    });
    if (row === null || row.videoProvider !== 'upload' || row.mirrorStatus === null) {
      throw new NotFoundException('المادة دي مش فيديو مرفوع');
    }
    return {
      status: row.mirrorStatus,
      progress: row.mirrorProgress,
      durationSeconds: row.durationSeconds !== null && row.durationSeconds > 0 ? row.durationSeconds : null,
      maxHeight: row.mirrorHeight,
      sizeBytes: row.mirrorBytes === null ? null : Number(row.mirrorBytes),
      error: row.mirrorError,
    };
  }

  /**
   * The row must be an uploaded video, still `uploading`, and the session the
   * caller names — anything else is a stale tab completing into a row that has
   * moved on (or been deleted).
   */
  private async requireSession(resourceId: string, videoId: string) {
    if (!UPLOAD_ID_RE.test(videoId)) throw new BadRequestException('رقم الرفع مش مظبوط');
    if (!UUID_RE.test(resourceId)) throw new NotFoundException('الرفع ده مش موجود — يمكن يكون اتلغى أو اتمسح');
    const row = await this.prisma.lessonResource.findUnique({
      where: { id: resourceId },
      select: { lessonId: true, videoProvider: true, videoExternalId: true, mirrorStatus: true, sourceBytes: true },
    });
    if (row === null || row.videoProvider !== 'upload' || row.videoExternalId !== videoId) {
      throw new NotFoundException('الرفع ده مش موجود — يمكن يكون اتلغى أو اتمسح');
    }
    if (row.mirrorStatus !== 'uploading') throw new BadRequestException('الرفع ده خلص خلاص');
    return row;
  }
}
