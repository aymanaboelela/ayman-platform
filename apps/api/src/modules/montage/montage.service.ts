import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { LessonCreateSchema } from '@ayman/contracts/content';
import { VIDEO_LIBRARY_COURSE_SLUG } from '@ayman/contracts/admin/video-upload';
import { uploadPartCount, uploadPartSize, uploadSourceKey } from '@ayman/contracts/video';
import {
  montageSourceKey,
  type MontageDownload,
  type MontageList,
  type MontagePublish,
  type MontagePublishResult,
  type MontageTargets,
  type MontageUploadComplete,
  type MontageUploadResume,
  type MontageUploadSession,
  type MontageUploadStart,
  type MontageVideo,
  type MontageVideoPatch,
} from '@ayman/contracts/montage';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { LessonService } from '../content/lesson.service';
import { VideoArchiveService } from '../video-mirror/video-archive.service';
import { VideoMirrorService } from '../video-mirror/video-mirror.service';
import { SIGNED_URL_TTL_SECONDS, reopenSession } from '../video-mirror/video-upload.service';

/** A download link's life. Long enough to start a slow download, short enough not to be a share link. */
const DOWNLOAD_TTL_SECONDS = 60 * 60;

/**
 * ══════════════════════════════════════════════════════════════════════════
 * «المونتاج» — the editor hands a video over; the instructor takes it
 * ══════════════════════════════════════════════════════════════════════════
 *
 * See `@ayman/contracts/montage` for the shape of the idea. The upload half is
 * the lecture upload's (`VideoUploadService`) with a different row and a
 * different bucket root; the publish half is `VideoLibraryService.attach`'s,
 * except the lesson gets a fresh encode from a copy of the original rather
 * than a ladder that already exists.
 */
@Injectable()
export class MontageService {
  private readonly logger = new Logger(MontageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mirror: VideoMirrorService,
    private readonly archive: VideoArchiveService,
    private readonly lessons: LessonService,
    private readonly audit: AuditService,
  ) {}

  private storage() {
    const storage = this.mirror.objectStorage;
    if (storage === null) {
      // 422, the lecture upload's answer: nothing is broken, the bucket is
      // simply not configured on this stack.
      throw new UnprocessableEntityException('تخزين الفيديو مش مفعّل على السيرفر ده — لازم يتظبط الأول');
    }
    return storage;
  }

  private async row(id: string) {
    const row = await this.prisma.montageVideo.findUnique({ where: { id } }).catch(() => null);
    if (row === null) throw new NotFoundException('الفيديو ده مش موجود');
    return row;
  }

  async list(): Promise<MontageList> {
    const rows = await this.prisma.montageVideo.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });

    const userIds = [...new Set(rows.map((row) => row.uploadedBy).filter((id): id is string => id !== null))];
    const lessonIds = [...new Set(rows.map((row) => row.publishedLessonId).filter((id): id is string => id !== null))];
    const [users, lessons] = await Promise.all([
      userIds.length === 0
        ? []
        : this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
      lessonIds.length === 0
        ? []
        : this.prisma.lesson.findMany({
            where: { id: { in: lessonIds } },
            select: { id: true, title: true, section: { select: { course: { select: { id: true, title: true } } } } },
          }),
    ]);
    const names = new Map(users.map((user) => [user.id, user.name]));
    const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));

    const videos: MontageVideo[] = rows.map((row) => {
      const lesson = row.publishedLessonId === null ? undefined : lessonById.get(row.publishedLessonId);
      return {
        id: row.id,
        title: row.title,
        note: row.note,
        fileName: row.fileName,
        sizeBytes: Number(row.sizeBytes),
        status: row.status === 'ready' ? 'ready' : 'uploading',
        uploadedBy: row.uploadedBy === null ? null : (names.get(row.uploadedBy) ?? null),
        createdAt: row.createdAt.toISOString(),
        lesson:
          lesson === undefined || row.publishedAt === null
            ? null
            : {
                lessonId: lesson.id,
                lessonTitle: lesson.title,
                courseId: lesson.section.course.id,
                courseTitle: lesson.section.course.title,
                at: row.publishedAt.toISOString(),
              },
      };
    });
    const totalBytes = rows.reduce((sum, row) => (row.status === 'ready' ? sum + Number(row.sizeBytes) : sum), 0);
    return { videos, totalBytes };
  }

  /**
   * Open a session. The row is written before a byte moves, so a tab closed
   * at 60% leaves something on the list that can be resumed or deleted —
   * rather than billed parts nobody can see.
   */
  async start(input: MontageUploadStart, actorId: string): Promise<MontageUploadSession> {
    const storage = this.storage();
    // 128 bits, from the CSPRNG: the bucket is public by necessity (students
    // fetch segments from it with no session), so the key is the lock.
    const storageId = randomBytes(16).toString('hex');
    const key = montageSourceKey(storageId);

    const uploadId = await storage.createMultipart(key, input.contentType);
    const parts = await storage.presignParts(key, uploadId, uploadPartCount(input.sizeBytes), SIGNED_URL_TTL_SECONDS);

    const row = await this.prisma.montageVideo.create({
      data: {
        title: input.title,
        note: input.note === undefined || input.note === '' ? null : input.note,
        fileName: input.fileName,
        storageId,
        uploadId,
        sizeBytes: BigInt(input.sizeBytes),
        status: 'uploading',
        uploadedBy: actorId,
      },
      select: { id: true },
    });

    this.logger.log({ montageId: row.id, sizeBytes: input.sizeBytes }, 'montage upload started');
    return {
      videoId: row.id,
      uploadId,
      partSizeBytes: uploadPartSize(input.sizeBytes),
      parts,
      expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
    };
  }

  /** «كمّل الرفع» — the same file, after the tab lost it. */
  async resume(id: string, input: MontageUploadResume): Promise<MontageUploadSession> {
    const row = await this.row(id);
    const storage = this.storage();
    if (row.status !== 'uploading' || row.uploadId === null) throw new ConflictException('الفيديو ده اترفع خلاص');
    if (Number(row.sizeBytes) !== input.sizeBytes) {
      throw new BadRequestException('ده مش نفس الملف اللي كان بيترفع — اختار نفس الملف');
    }
    const session = await reopenSession(
      storage,
      { videoId: row.storageId, uploadId: row.uploadId, sizeBytes: input.sizeBytes },
      montageSourceKey(row.storageId),
    );
    return { ...session, videoId: row.id };
  }

  /** Seal it. S3 refuses a completion missing any part, so a half file never becomes `ready`. */
  async complete(id: string, input: MontageUploadComplete): Promise<MontageVideo> {
    const row = await this.row(id);
    const storage = this.storage();
    if (row.status !== 'uploading' || row.uploadId !== input.uploadId) {
      throw new ConflictException('الرفع ده اتقفل أو اتلغى');
    }
    const key = montageSourceKey(row.storageId);
    await storage.completeMultipart(key, input.uploadId, input.parts);
    const size = await storage.sizeOf(key);
    if (size === null || size === 0) {
      throw new UnprocessableEntityException('الرفع مخلصش صح — جرّب ترفع الملف تاني');
    }

    await this.prisma.montageVideo.update({
      where: { id },
      data: { status: 'ready', uploadId: null, sizeBytes: BigInt(size) },
    });
    await this.audit.record({
      action: 'montage:upload',
      resourceType: AUDIT_RESOURCES.montageVideo,
      resourceId: id,
      outcome: 'success',
      metadata: { title: row.title, fileName: row.fileName, sizeBytes: size },
    });
    this.logger.log({ montageId: id, size }, 'montage upload complete');
    return this.one(id);
  }

  private async one(id: string): Promise<MontageVideo> {
    const found = (await this.list()).videos.find((video) => video.id === id);
    if (found === undefined) throw new NotFoundException('الفيديو ده مش موجود');
    return found;
  }

  async patch(id: string, input: MontageVideoPatch): Promise<MontageVideo> {
    const row = await this.row(id);
    await this.prisma.montageVideo.update({
      where: { id },
      data: {
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.note === undefined ? {} : { note: input.note === null || input.note === '' ? null : input.note }),
      },
    });
    await this.audit.record({
      action: 'montage:update',
      resourceType: AUDIT_RESOURCES.montageVideo,
      resourceId: id,
      outcome: 'success',
      metadata: { from: row.title, to: input.title ?? row.title },
    });
    return this.one(id);
  }

  /**
   * Gone — the row AND the bytes. An unfinished upload's parts are aborted
   * too: they are stored and billed and appear in no listing. A lesson the
   * video was put on keeps playing: it has its own copy.
   */
  async remove(id: string): Promise<void> {
    const row = await this.row(id);
    const storage = this.storage();
    const key = montageSourceKey(row.storageId);
    if (row.uploadId !== null) await storage.abortMultipart(key, row.uploadId);
    await storage.deleteObject(key);
    await this.prisma.montageVideo.delete({ where: { id } });
    await this.audit.record({
      action: 'montage:delete',
      resourceType: AUDIT_RESOURCES.montageVideo,
      resourceId: id,
      outcome: 'success',
      metadata: { title: row.title, fileName: row.fileName, sizeBytes: Number(row.sizeBytes) },
    });
  }

  /** «نزّل» — a short-lived link to the original, saved under its own file name. */
  async download(id: string): Promise<MontageDownload> {
    const row = await this.row(id);
    const storage = this.storage();
    if (row.status !== 'ready') throw new ConflictException('الفيديو لسه بيترفع');
    const url = await storage.presignDownload(montageSourceKey(row.storageId), row.fileName, DOWNLOAD_TTL_SECONDS);
    return { url, expiresAt: new Date(Date.now() + DOWNLOAD_TTL_SECONDS * 1000).toISOString() };
  }

  /**
   * Every place a hand-over can go: each course's sections, and the video
   * lessons in them. Never the library's hidden holding course.
   */
  async targets(): Promise<MontageTargets> {
    const courses = await this.prisma.course.findMany({
      where: { slug: { not: VIDEO_LIBRARY_COURSE_SLUG }, status: { not: 'archived' } },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        status: true,
        sections: {
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            title: true,
            lessons: {
              where: { kind: 'video' },
              orderBy: [{ position: 'asc' }, { id: 'asc' }],
              select: { id: true, title: true, video: { select: { externalId: true } } },
            },
          },
        },
      },
    });
    return {
      courses: courses.map((course) => ({
        id: course.id,
        title: course.title,
        status: course.status,
        sections: course.sections.map((section) => ({
          id: section.id,
          title: section.title,
          lessons: section.lessons.map((lesson) => ({ id: lesson.id, title: lesson.title, hasVideo: lesson.video !== null })),
        })),
      })),
    };
  }

  /**
   * «حطه في درس» — a lesson gets its own copy of the original, and the
   * regular encode takes it from there.
   *
   * The copy is made FIRST, before any lesson row changes: a copy that fails
   * (bucket down, file gone) then leaves the lesson exactly as it was, and a
   * «درس جديد» is not left behind empty. Whatever the lesson played before is
   * kept in «محفوظة», never deleted — `VideoLibraryService.attach`'s promise.
   */
  async publish(id: string, input: MontagePublish, actorId: string): Promise<MontagePublishResult> {
    const row = await this.row(id);
    const storage = this.storage();
    if (row.status !== 'ready') throw new ConflictException('الفيديو لسه بيترفع — استنى لما يخلص');

    // Refuse before copying gigabytes: the lesson must be able to take it.
    const existing = input.lessonId === undefined ? null : await this.targetLesson(input.lessonId);
    if (input.sectionId !== undefined) {
      const section = await this.prisma.courseSection.findUnique({ where: { id: input.sectionId }, select: { id: true } });
      if (section === null) throw new NotFoundException('الوحدة دي مش موجودة');
    }

    const videoId = randomBytes(16).toString('hex');
    const sourceKey = uploadSourceKey(videoId);
    await storage.copyObject(montageSourceKey(row.storageId), sourceKey, Number(row.sizeBytes));

    let lessonId: string;
    let courseId: string;
    try {
      if (existing === null) {
        // A draft at the end of the section — published by hand when it is
        // ready, the same as a lesson made from the course editor. The schema's
        // refinement guarantees both fields when there is no `lessonId`.
        const lesson = await this.lessons.create(
          input.sectionId!,
          LessonCreateSchema.parse({ title: input.title, kind: 'video' }),
        );
        lessonId = lesson.id;
        courseId = lesson.courseId;
      } else {
        lessonId = input.lessonId!;
        courseId = existing.section.course.id;
      }

      const data = {
        provider: 'upload' as const,
        externalId: videoId,
        // Read from the file by the encode; zero until then, as for any upload.
        durationSeconds: 0,
        posterKey: null,
        captions: Prisma.DbNull,
        mirrorStatus: 'pending' as const,
        mirrorHeight: null,
        mirrorBytes: null,
        mirrorError: null,
        mirrorAttempts: 0,
        mirrorAt: null,
        mirrorProgress: 0,
        encrypted: input.encrypt,
        sourceBytes: row.sizeBytes,
        sourceName: row.fileName,
        trimStartSeconds: null,
        trimEndSeconds: null,
        trimCuts: Prisma.DbNull,
        fullDurationSeconds: null,
      };
      await this.prisma.lessonVideo.upsert({ where: { lessonId }, create: { lessonId, ...data }, update: data });
    } catch (error) {
      await storage.deleteObject(sourceKey);
      throw error;
    }

    const displaced = existing?.video ?? null;
    if (displaced !== null && displaced.provider === 'upload') {
      await this.archive.release(displaced, displaced.mirrorStatus === 'ready', {
        lessonTitle: existing?.title ?? null,
        courseTitle: existing?.section.course.title ?? null,
      });
    }

    await this.prisma.montageVideo.update({ where: { id }, data: { publishedLessonId: lessonId, publishedAt: new Date() } });
    await this.audit.record({
      action: 'montage:publish',
      resourceType: AUDIT_RESOURCES.montageVideo,
      resourceId: id,
      outcome: 'success',
      metadata: {
        lessonId,
        courseId,
        mode: existing === null ? 'new' : 'existing',
        videoId,
        displaced: displaced?.externalId ?? null,
        actorId,
      },
    });
    this.logger.log({ montageId: id, lessonId, videoId }, 'montage video put on a lesson');
    return { courseId, lessonId };
  }

  /** `VideoLibraryService.targetLesson`'s refusals: a video lesson, not mid-upload. */
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
    if (lesson === null) throw new NotFoundException('الدرس ده مش موجود');
    if (lesson.kind !== 'video') throw new BadRequestException('ده مش درس فيديو');
    if (lesson.video?.mirrorStatus === 'uploading' || lesson.video?.mirrorStatus === 'mirroring') {
      throw new ConflictException('الدرس ده عليه فيديو لسه بيترفع أو بيتجهز — استنى لما يخلص');
    }
    return lesson;
  }
}
