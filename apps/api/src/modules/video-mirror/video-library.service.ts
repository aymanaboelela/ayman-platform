import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { VideoLibrary, VideoLibraryOrphan } from '@ayman/contracts/admin/video-upload';
import { UPLOAD_ID_RE, isVideoExternalId, mirrorPrefix, uploadSourceKey } from '@ayman/contracts/video';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { VideoMirrorService } from './video-mirror.service';
import { VideoUploadService } from './video-upload.service';

/**
 * How many leftover folders get sized per page load. Each one is a bucket
 * listing; past this the screen would take longer to open than it is worth,
 * and the rest still appear — with a size of zero until the first ones go.
 */
const ORPHANS_SIZED = 60;

/**
 * ══════════════════════════════════════════════════════════════════════════
 * «الفيديوهات» — every uploaded lecture, what it weighs, and deleting it
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The bucket is billed by the byte, and nothing else on the platform ever
 * removed a byte from it: deleting a lesson, a section or a whole course
 * cascades the `lesson_videos` row away and leaves the ladder behind, listed
 * nowhere. This is the one place that shows both halves — the uploads lessons
 * still use, and the folders nothing points at any more — and deletes files,
 * not just rows.
 */
@Injectable()
export class VideoLibraryService {
  private readonly logger = new Logger(VideoLibraryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mirror: VideoMirrorService,
    private readonly uploads: VideoUploadService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<VideoLibrary> {
    const rows = await this.prisma.lessonVideo.findMany({
      where: { provider: 'upload' },
      orderBy: { updatedAt: 'desc' },
      select: {
        externalId: true,
        mirrorStatus: true,
        sourceName: true,
        durationSeconds: true,
        mirrorHeight: true,
        mirrorBytes: true,
        sourceBytes: true,
        updatedAt: true,
        lesson: {
          select: {
            id: true,
            title: true,
            section: { select: { title: true, course: { select: { id: true, title: true } } } },
          },
        },
      },
    });

    const items = rows.map((row) => ({
      videoId: row.externalId,
      status: row.mirrorStatus,
      sourceName: row.sourceName,
      // Zero is the placeholder written when the upload opens.
      durationSeconds: row.durationSeconds > 0 ? row.durationSeconds : null,
      maxHeight: row.mirrorHeight,
      // A ready lecture is its ladder — the original is deleted once the
      // ladder is up. Anything short of ready is still the original.
      sizeBytes:
        row.mirrorStatus === 'ready' && row.mirrorBytes !== null
          ? Number(row.mirrorBytes)
          : row.sourceBytes === null
            ? null
            : Number(row.sourceBytes),
      updatedAt: row.updatedAt.toISOString(),
      lessonId: row.lesson.id,
      lessonTitle: row.lesson.title,
      courseId: row.lesson.section.course.id,
      courseTitle: row.lesson.section.course.title,
      sectionTitle: row.lesson.section.title,
    }));

    const listed = items.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0);
    const orphans = await this.orphans().catch((error: unknown) => {
      this.logger.warn({ err: error }, 'video library could not read the bucket');
      return null;
    });

    return {
      items,
      orphans: orphans ?? [],
      totalBytes: listed + (orphans ?? []).reduce((sum, orphan) => sum + orphan.sizeBytes, 0),
      storageRead: orphans !== null,
    };
  }

  /**
   * Folders in the bucket no lesson points at.
   *
   * «Points at» is ANY row, not just uploads: a YouTube mirror lives under
   * `v/<youtubeId>/` too, and the same YouTube video can sit on several
   * lessons — its folder is in use as long as one of them exists.
   */
  private async orphans(): Promise<VideoLibraryOrphan[]> {
    const storage = this.mirror.objectStorage;
    if (storage === null) return [];

    const [ladders, sources, referenced, parked] = await Promise.all([
      storage.listMirroredIds(),
      storage.listSourceIds(),
      this.prisma.lessonVideo.findMany({ select: { externalId: true } }),
      this.uploads.parkedReplacedIds(),
    ]);
    const used = new Set(referenced.map((row) => row.externalId));
    const ids = [...new Set([...ladders, ...sources])].filter(
      (id) => !used.has(id) && !parked.has(id) && isVideoExternalId(id),
    );

    const orphans: VideoLibraryOrphan[] = [];
    for (const [index, id] of ids.entries()) {
      if (index >= ORPHANS_SIZED) {
        orphans.push({ videoId: id, sizeBytes: 0, lastModified: null });
        continue;
      }
      const [ladder, source] = await Promise.all([
        storage.prefixUsage(mirrorPrefix(id)),
        UPLOAD_ID_RE.test(id) ? storage.prefixUsage(`raw/${id}`) : { bytes: 0, lastModified: null },
      ]);
      const newest = [ladder.lastModified, source.lastModified]
        .filter((date): date is Date => date !== null)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      orphans.push({
        videoId: id,
        sizeBytes: ladder.bytes + source.bytes,
        lastModified: newest === undefined ? null : newest.toISOString(),
      });
    }
    return orphans.sort((a, b) => b.sizeBytes - a.sizeBytes);
  }

  /**
   * Delete one video: the rows that point at it, then its files.
   *
   * Rows FIRST. The other order leaves a lesson pointing at a ladder that is
   * gone — a grey box for every student until someone notices — whereas a
   * storage failure after the rows are gone leaves a folder this same screen
   * lists as leftover and deletes on the next try.
   */
  async remove(videoId: string): Promise<{ videoId: string; lessonIds: string[] }> {
    if (!isVideoExternalId(videoId)) throw new BadRequestException('رقم الفيديو مش مظبوط');

    const storage = this.mirror.objectStorage;
    if (storage === null) throw new ServiceUnavailableException('تخزين الفيديو مش متظبط على المنصة دي');

    const rows = await this.prisma.lessonVideo.findMany({
      where: { externalId: videoId },
      select: { lessonId: true, provider: true, mirrorStatus: true },
    });

    // A YouTube lecture is not ours to delete from here: removing its copy
    // would only send the tablet students back to the site that blocks them.
    if (rows.some((row) => row.provider !== 'upload')) {
      throw new BadRequestException('ده فيديو يوتيوب — بيتشال من المحاضرة نفسها');
    }
    // Mid-upload or mid-encode: the worker would write the files straight back.
    if (rows.some((row) => row.mirrorStatus === 'uploading' || row.mirrorStatus === 'mirroring')) {
      throw new ConflictException('الفيديو ده لسه بيترفع أو بيتجهز — استنى لما يخلص');
    }
    if (rows.length === 0) {
      const parked = await this.uploads.parkedReplacedIds().catch(() => null);
      if (parked === null) {
        throw new ServiceUnavailableException('مقدرناش نتأكد إن مفيش رفع شغّال — جرّب كمان شوية');
      }
      if (parked.has(videoId)) {
        throw new ConflictException('فيه رفع شغّال بيبدّل الفيديو ده — استنى لما يخلص');
      }
      const [ladder, source] = await Promise.all([
        storage.prefixUsage(mirrorPrefix(videoId)),
        UPLOAD_ID_RE.test(videoId) ? storage.prefixUsage(`raw/${videoId}`) : { bytes: 0, lastModified: null },
      ]);
      if (ladder.lastModified === null && source.lastModified === null) {
        throw new NotFoundException('الفيديو ده مش موجود');
      }
    }

    const lessonIds = rows.map((row) => row.lessonId);
    if (lessonIds.length > 0) {
      await this.prisma.lessonVideo.deleteMany({ where: { externalId: videoId, provider: 'upload' } });
    }

    await storage.deletePrefix(mirrorPrefix(videoId));
    if (UPLOAD_ID_RE.test(videoId)) await storage.deleteObject(uploadSourceKey(videoId));

    await this.audit.record({
      action: 'video:delete',
      resourceType: AUDIT_RESOURCES.lessonVideo,
      resourceId: videoId,
      outcome: 'success',
      metadata: { lessonIds, leftover: lessonIds.length === 0 },
    });

    return { videoId, lessonIds };
  }
}
