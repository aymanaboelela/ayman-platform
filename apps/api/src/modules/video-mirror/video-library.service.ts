import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  VIDEO_LIBRARY_COURSE_SLUG,
  type ReusableVideos,
  type VideoLibrary,
  type VideoLibraryOrphan,
  type VideoUploadSlotResult,
} from '@ayman/contracts/admin/video-upload';
import { UPLOAD_ID_RE, isVideoExternalId, mirrorPrefix, uploadSourceKey } from '@ayman/contracts/video';
import { AuditService } from '../../audit/audit.service';
import { IS_AYMAN } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { VideoArchiveService } from './video-archive.service';
import { VideoMirrorService } from './video-mirror.service';
import { VideoUploadService } from './video-upload.service';

/**
 * How many leftover folders get sized per page load. Each one is a bucket
 * listing; past this the screen would take longer to open than it is worth,
 * and the rest still appear — with a size of zero until the first ones go.
 */
const ORPHANS_SIZED = 60;

/**
 * How long one whole-bucket listing stands in for the next. A listing is a
 * page per thousand objects (an HLS ladder is thousands of segments), so it
 * is not repeated on every open; a delete from this screen clears it.
 */
const BUCKET_TOTAL_TTL_MS = 10 * 60_000;

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
  private bucketTotal: { bytes: number; at: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mirror: VideoMirrorService,
    private readonly uploads: VideoUploadService,
    private readonly audit: AuditService,
    private readonly archive: VideoArchiveService,
  ) {}

  /**
   * «ارفع فيديو» من صفحة الفيديوهات — a holding lesson to upload into.
   *
   * See `VIDEO_LIBRARY_COURSE_SLUG`. The hidden course is created on first use,
   * ARCHIVED (out of every student surface, out of the published/draft counts)
   * and copies its system/year/subject from the oldest real course, because
   * those columns are required and the course is never shown with them. A
   * stack with no course at all cannot have a library upload yet — there is
   * nothing to put the video on afterwards either.
   */
  async createUploadSlot(title: string, actorId: string): Promise<VideoUploadSlotResult> {
    let course = await this.prisma.course.findUnique({
      where: { slug: VIDEO_LIBRARY_COURSE_SLUG },
      select: { id: true },
    });
    if (course === null) {
      const template = await this.prisma.course.findFirst({
        where: { slug: { not: VIDEO_LIBRARY_COURSE_SLUG } },
        orderBy: { createdAt: 'asc' },
        select: { systemId: true, year: true, subjectId: true },
      });
      if (template === null) throw new ConflictException('اعمل كورس الأول — الفيديو محتاج مكان يتحط فيه بعد الرفع');
      course = await this.prisma.course.create({
        data: {
          slug: VIDEO_LIBRARY_COURSE_SLUG,
          title: 'مكتبة الفيديوهات — رفع مباشر',
          status: 'archived',
          systemId: template.systemId,
          year: template.year,
          subjectId: template.subjectId,
          instructorId: actorId,
          position: 9999,
        },
        select: { id: true },
      });
    }

    const section =
      (await this.prisma.courseSection.findFirst({ where: { courseId: course.id }, select: { id: true } })) ??
      (await this.prisma.courseSection.create({
        data: { courseId: course.id, title: 'رفع مباشر', position: 0 },
        select: { id: true },
      }));

    const last = await this.prisma.lesson.findFirst({
      where: { sectionId: section.id },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const lesson = await this.prisma.lesson.create({
      data: { courseId: course.id, sectionId: section.id, title, kind: 'video', position: (last?.position ?? -1) + 1 },
      select: { id: true },
    });

    await this.audit.record({
      action: 'lesson:update',
      resourceType: AUDIT_RESOURCES.lesson,
      resourceId: lesson.id,
      outcome: 'success',
      metadata: { operation: 'libraryUploadSlot', title },
    });
    return { courseId: course.id, lessonId: lesson.id };
  }

  /**
   * Library uploads whose encode has finished leave their holding lesson for
   * «محفوظة». Run on every read of the library and of the reusable picker, so
   * a finished upload is never shown in two places — no job to schedule, and
   * nothing to miss: the next look at either screen settles it.
   *
   * The lesson is deleted FIRST, then `release` decides: if another lesson
   * already uses the video (it was picked from the lesson editor before it got
   * here) it simply stays there; otherwise it is kept in «محفوظة».
   */
  private async settleLibraryUploads(): Promise<void> {
    const ready = await this.prisma.lessonVideo.findMany({
      where: { provider: 'upload', mirrorStatus: 'ready', lesson: { course: { slug: VIDEO_LIBRARY_COURSE_SLUG } } },
      select: {
        lessonId: true,
        externalId: true,
        sourceName: true,
        durationSeconds: true,
        mirrorHeight: true,
        mirrorBytes: true,
        posterKey: true,
        fullDurationSeconds: true,
      },
    });
    for (const video of ready) {
      await this.prisma.lesson.delete({ where: { id: video.lessonId } });
      await this.archive.release(video, true, { lessonTitle: null, courseTitle: null });
    }
  }

  async list(): Promise<VideoLibrary> {
    await this.settleLibraryUploads();
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
            section: { select: { title: true, course: { select: { id: true, title: true, slug: true } } } },
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
      library: row.lesson.section.course.slug === VIDEO_LIBRARY_COURSE_SLUG,
    }));

    const kept = await this.prisma.archivedVideo.findMany({ orderBy: { archivedAt: 'desc' } });
    const archived = kept.map((row) => ({
      videoId: row.externalId,
      sourceName: row.sourceName,
      durationSeconds: row.durationSeconds,
      maxHeight: row.mirrorHeight,
      sizeBytes: row.mirrorBytes === null ? null : Number(row.mirrorBytes),
      fromLessonTitle: row.fromLessonTitle,
      fromCourseTitle: row.fromCourseTitle,
      archivedAt: row.archivedAt.toISOString(),
    }));

    // Every video lesson a kept video could be put back on, drafts included —
    // never a library upload's holding lesson.
    const lessons = await this.prisma.lesson.findMany({
      where: { kind: 'video', course: { slug: { not: VIDEO_LIBRARY_COURSE_SLUG } } },
      orderBy: [{ section: { course: { title: 'asc' } } }, { section: { position: 'asc' } }, { position: 'asc' }],
      select: {
        id: true,
        title: true,
        video: { select: { lessonId: true } },
        section: { select: { title: true, course: { select: { title: true } } } },
      },
    });
    const targets = lessons.map((lesson) => ({
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      courseTitle: lesson.section.course.title,
      sectionTitle: lesson.section.title,
      hasVideo: lesson.video !== null,
    }));

    const listed =
      items.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0) +
      archived.reduce((sum, video) => sum + (video.sizeBytes ?? 0), 0);
    const orphans = await this.orphans(new Set(archived.map((video) => video.videoId))).catch((error: unknown) => {
      this.logger.warn({ err: error }, 'video library could not read the bucket');
      return null;
    });

    const rowsTotal = listed + (orphans ?? []).reduce((sum, orphan) => sum + orphan.sizeBytes, 0);

    return {
      items,
      archived,
      targets,
      orphans: orphans ?? [],
      totalBytes: (await this.wholeBucketBytes()) ?? rowsTotal,
      storageRead: orphans !== null,
    };
  }

  /**
   * The total a teacher is CHARGED on: the bucket itself, not our rows.
   *
   * The rows miss a material's video, the montage's sources and every
   * leftover past `ORPHANS_SIZED`, so a teacher was shown less than the owner
   * pays Cloudflare for. The owner's own figure comes from Cloudflare's
   * analytics on the web side instead (his bucket holds the YouTube copies —
   * too many objects to list per open), so his stack skips this: `null`, and
   * the row sum stays the fallback for a stack where neither is readable.
   */
  private async wholeBucketBytes(): Promise<number | null> {
    const storage = this.mirror.objectStorage;
    if (IS_AYMAN || storage === null) return null;
    if (this.bucketTotal !== null && Date.now() - this.bucketTotal.at < BUCKET_TOTAL_TTL_MS) {
      return this.bucketTotal.bytes;
    }
    try {
      const bytes = await storage.bucketBytes();
      this.bucketTotal = { bytes, at: Date.now() };
      return bytes;
    } catch (error) {
      this.logger.warn({ err: error }, 'video library could not total the bucket');
      return null;
    }
  }

  /**
   * «رجّعه لمحاضرة» — put a kept video on a video lesson.
   *
   * Whatever that lesson plays now is KEPT in its place, never deleted: the
   * owner asked for a way back, and a restore that silently threw away the
   * video it displaced would be the one-way door he asked not to have.
   */
  async restore(videoId: string, lessonId: string): Promise<{ videoId: string; lessonId: string }> {
    const kept = await this.prisma.archivedVideo.findUnique({ where: { externalId: videoId } });
    if (kept === null) throw new NotFoundException('الفيديو ده مش في «محفوظة»');

    const lesson = await this.targetLesson(lessonId);

    const data = {
      provider: 'upload' as const,
      externalId: kept.externalId,
      sourceName: kept.sourceName,
      durationSeconds: kept.durationSeconds,
      mirrorHeight: kept.mirrorHeight,
      mirrorBytes: kept.mirrorBytes,
      posterKey: kept.posterKey,
      mirrorStatus: 'ready' as const,
      mirrorError: null,
      mirrorProgress: 100,
      mirrorAttempts: 0,
      // Back whole: a trim belonged to the lesson the video used to be on.
      trimStartSeconds: null,
      trimEndSeconds: null,
      trimCuts: Prisma.DbNull,
      fullDurationSeconds: null,
    };
    await this.prisma.$transaction([
      this.prisma.lessonVideo.upsert({ where: { lessonId }, create: { lessonId, ...data }, update: data }),
      this.prisma.archivedVideo.delete({ where: { externalId: videoId } }),
    ]);

    const displaced = lesson.video;
    if (displaced !== null && displaced.provider === 'upload' && displaced.externalId !== videoId) {
      await this.archive.release(displaced, displaced.mirrorStatus === 'ready', {
        lessonTitle: lesson.title,
        courseTitle: lesson.section.course.title,
      });
    }

    await this.audit.record({
      action: 'lesson:update',
      resourceType: AUDIT_RESOURCES.lesson,
      resourceId: lessonId,
      outcome: 'success',
      metadata: { operation: 'restoreVideo', videoId, displaced: displaced?.externalId ?? null },
    });
    return { videoId, lessonId };
  }

  /**
   * The video lesson a video is about to be put on — and the refusals both
   * «رجّعه» and «اختار متروفع» share: not a video lesson, or one whose own
   * upload is still in flight (swapping under it would orphan that upload).
   */
  private async targetLesson(lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        kind: true,
        title: true,
        section: { select: { course: { select: { id: true, title: true } } } },
        video: {
          select: {
            provider: true,
            externalId: true,
            sourceName: true,
            durationSeconds: true,
            mirrorHeight: true,
            mirrorBytes: true,
            mirrorStatus: true,
            posterKey: true,
            fullDurationSeconds: true,
          },
        },
      },
    });
    if (lesson === null) throw new NotFoundException('المحاضرة مش موجودة');
    if (lesson.kind !== 'video') throw new BadRequestException('دي مش محاضرة فيديو');
    if (lesson.video?.mirrorStatus === 'uploading' || lesson.video?.mirrorStatus === 'mirroring') {
      throw new ConflictException('المحاضرة دي عليها فيديو لسه بيترفع أو بيتجهز — استنى لما يخلص');
    }
    return lesson;
  }

  /**
   * «اختار فيديو متروفع قبل كده» — every video a lesson could point at without
   * a new upload: the ready uploads lessons play now (one row per video, not
   * per lesson), and the kept ones. No bucket listing — see
   * `ReusableVideosSchema`.
   */
  async reusable(): Promise<ReusableVideos> {
    await this.settleLibraryUploads();
    const rows = await this.prisma.lessonVideo.findMany({
      where: { provider: 'upload', mirrorStatus: 'ready' },
      orderBy: { updatedAt: 'desc' },
      select: {
        externalId: true,
        sourceName: true,
        durationSeconds: true,
        mirrorHeight: true,
        updatedAt: true,
        lesson: {
          select: { id: true, title: true, section: { select: { title: true, course: { select: { title: true } } } } },
        },
      },
    });
    const byVideo = new Map<string, ReusableVideos['videos'][number]>();
    for (const row of rows) {
      const seen = byVideo.get(row.externalId);
      if (seen) {
        seen.lessonIds.push(row.lesson.id);
        continue;
      }
      byVideo.set(row.externalId, {
        videoId: row.externalId,
        sourceName: row.sourceName,
        durationSeconds: row.durationSeconds > 0 ? row.durationSeconds : null,
        maxHeight: row.mirrorHeight,
        lessonIds: [row.lesson.id],
        lessonTitle: row.lesson.title,
        sectionTitle: row.lesson.section.title,
        courseTitle: row.lesson.section.course.title,
        kept: false,
        updatedAt: row.updatedAt.toISOString(),
      });
    }
    const kept = await this.prisma.archivedVideo.findMany({ orderBy: { archivedAt: 'desc' } });
    const archived = kept
      .filter((row) => !byVideo.has(row.externalId))
      .map((row) => ({
        videoId: row.externalId,
        sourceName: row.sourceName,
        durationSeconds: row.durationSeconds > 0 ? row.durationSeconds : null,
        maxHeight: row.mirrorHeight,
        lessonIds: [],
        lessonTitle: row.fromLessonTitle,
        sectionTitle: null,
        courseTitle: row.fromCourseTitle,
        kept: true,
        updatedAt: row.archivedAt.toISOString(),
      }));
    return { videos: [...byVideo.values(), ...archived] };
  }

  /**
   * Put a video that is already in the bucket on one more lesson.
   *
   * A kept one is simply «رجّعه» — it leaves «محفوظة». One that another lesson
   * plays is SHARED: the new row copies that lesson's — file, poster, length,
   * and its trim, because the usual case is the same lecture in a second
   * course (عربي ولغات), cut the same way. Each lesson's trim is its own row
   * from then on.
   *
   * Whatever this lesson played before is kept in «محفوظة», never deleted —
   * the same promise as `restore`.
   */
  async attach(videoId: string, lessonId: string): Promise<{ videoId: string; lessonId: string }> {
    const kept = await this.prisma.archivedVideo.findUnique({ where: { externalId: videoId }, select: { externalId: true } });
    if (kept !== null) return this.restore(videoId, lessonId);

    const source = await this.prisma.lessonVideo.findFirst({
      where: { externalId: videoId, provider: 'upload', mirrorStatus: 'ready' },
      orderBy: { updatedAt: 'desc' },
      select: {
        lessonId: true,
        externalId: true,
        sourceName: true,
        durationSeconds: true,
        mirrorHeight: true,
        mirrorBytes: true,
        posterKey: true,
        captions: true,
        trimStartSeconds: true,
        trimEndSeconds: true,
        trimCuts: true,
        fullDurationSeconds: true,
      },
    });
    if (source === null) throw new NotFoundException('الفيديو ده مش موجود أو لسه بيتجهز');

    const lesson = await this.targetLesson(lessonId);
    if (lesson.video?.externalId === videoId) return { videoId, lessonId };

    const data = {
      provider: 'upload' as const,
      externalId: source.externalId,
      sourceName: source.sourceName,
      durationSeconds: source.durationSeconds,
      mirrorHeight: source.mirrorHeight,
      mirrorBytes: source.mirrorBytes,
      posterKey: source.posterKey,
      captions: (source.captions as Prisma.InputJsonValue | null) ?? Prisma.DbNull,
      mirrorStatus: 'ready' as const,
      mirrorError: null,
      mirrorProgress: 100,
      mirrorAttempts: 0,
      trimStartSeconds: source.trimStartSeconds,
      trimEndSeconds: source.trimEndSeconds,
      trimCuts: (source.trimCuts as Prisma.InputJsonValue | null) ?? Prisma.DbNull,
      fullDurationSeconds: source.fullDurationSeconds,
    };
    await this.prisma.lessonVideo.upsert({ where: { lessonId }, create: { lessonId, ...data }, update: data });

    const displaced = lesson.video;
    if (displaced !== null && displaced.provider === 'upload' && displaced.externalId !== videoId) {
      await this.archive.release(displaced, displaced.mirrorStatus === 'ready', {
        lessonTitle: lesson.title,
        courseTitle: lesson.section.course.title,
      });
    }

    await this.audit.record({
      action: 'lesson:update',
      resourceType: AUDIT_RESOURCES.lesson,
      resourceId: lessonId,
      outcome: 'success',
      metadata: { operation: 'attachVideo', videoId, fromLessonId: source.lessonId, displaced: displaced?.externalId ?? null },
    });
    return { videoId, lessonId };
  }

  /**
   * Folders in the bucket no lesson points at.
   *
   * «Points at» is ANY row, not just uploads: a YouTube mirror lives under
   * `v/<youtubeId>/` too, and the same YouTube video can sit on several
   * lessons — its folder is in use as long as one of them exists.
   */
  private async orphans(kept: ReadonlySet<string> = new Set()): Promise<VideoLibraryOrphan[]> {
    const storage = this.mirror.objectStorage;
    if (storage === null) return [];

    const [ladders, sources, referenced, materials, parked] = await Promise.all([
      storage.listMirroredIds(),
      storage.listSourceIds(),
      this.prisma.lessonVideo.findMany({ select: { externalId: true } }),
      // «رفع فيديو» in a lesson's materials lives under the same `v/<id>/` —
      // without this every one of them would be offered here for deletion.
      this.prisma.lessonResource.findMany({
        where: { videoProvider: 'upload' },
        select: { videoExternalId: true },
      }),
      this.uploads.parkedReplacedIds(),
    ]);
    const used = new Set([
      ...referenced.map((row) => row.externalId),
      ...materials.flatMap((row) => (row.videoExternalId === null ? [] : [row.videoExternalId])),
    ]);
    const ids = [...new Set([...ladders, ...sources])].filter(
      (id) => !used.has(id) && !parked.has(id) && !kept.has(id) && isVideoExternalId(id),
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
      // A material's video is not a leftover: it is deleted with its
      // material, from the lesson, which is where the admin can see what it is.
      const material = await this.prisma.lessonResource.count({
        where: { videoExternalId: videoId, videoProvider: 'upload' },
      });
      if (material > 0) {
        throw new ConflictException('الفيديو ده في مواد درس — امسحه من مواد الدرس نفسها');
      }
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

    await this.prisma.archivedVideo.deleteMany({ where: { externalId: videoId } });
    await storage.deletePrefix(mirrorPrefix(videoId));
    if (UPLOAD_ID_RE.test(videoId)) await storage.deleteObject(uploadSourceKey(videoId));
    // The screen this delete returns to must show the bucket lighter.
    this.bucketTotal = null;

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
