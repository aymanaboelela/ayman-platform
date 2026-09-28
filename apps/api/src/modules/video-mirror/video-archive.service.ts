import { Injectable, Logger } from '@nestjs/common';
import { UPLOAD_ID_RE, mirrorPrefix, uploadSourceKey } from '@ayman/contracts/video';
import { PrismaService } from '../../prisma/prisma.service';
import { VideoMirrorService } from './video-mirror.service';

/** What a lesson needs to play an uploaded video again without re-reading the bucket. */
export interface KeptVideo {
  externalId: string;
  sourceName: string | null;
  durationSeconds: number;
  mirrorHeight: number | null;
  mirrorBytes: bigint | null;
  posterKey: string | null;
  /** Set when the video was trimmed: `durationSeconds` is then the trimmed length. */
  fullDurationSeconds?: number | null;
}

/**
 * «احتفظ بيه» or «امسحه خالص» — the one decision every path that takes an
 * uploaded video OFF a lesson has to make: removing it, replacing it with a
 * new upload, or putting a kept one back in its place.
 *
 * Before this, all three deleted: removing left the files in the bucket with
 * nothing pointing at them, and replacing freed them the moment the new
 * upload landed. The owner's words: «لو مسحته تقولي امسحه خالص من السيرفر ولا
 * استبدله بس، عشان لو حبيت أرجّعه تاني».
 *
 * ⚠️ Only uploads. A YouTube mirror's folder is keyed by the YouTube id and can
 * be shared by several lessons; there is nothing of ours to keep or to purge.
 */
@Injectable()
export class VideoArchiveService {
  private readonly logger = new Logger(VideoArchiveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mirror: VideoMirrorService,
  ) {}

  /**
   * The video has just left a lesson: keep it in «محفوظة», or delete its files.
   *
   * A video another lesson still uses is neither — it simply stays where it is.
   */
  async release(video: KeptVideo, keep: boolean, from: { lessonTitle: string | null; courseTitle: string | null }) {
    if (!UPLOAD_ID_RE.test(video.externalId)) return;
    const stillUsed = await this.prisma.lessonVideo.count({ where: { externalId: video.externalId } });
    if (stillUsed > 0) return;

    if (keep) {
      await this.prisma.archivedVideo.upsert({
        where: { externalId: video.externalId },
        create: {
          externalId: video.externalId,
          sourceName: video.sourceName,
          // The whole video is what is kept; a trim belongs to the lesson it was on.
          durationSeconds: video.fullDurationSeconds ?? video.durationSeconds,
          mirrorHeight: video.mirrorHeight,
          mirrorBytes: video.mirrorBytes,
          posterKey: video.posterKey,
          fromLessonTitle: from.lessonTitle,
          fromCourseTitle: from.courseTitle,
        },
        update: {},
      });
      return;
    }
    await this.purge(video.externalId);
  }

  /** Delete the files, and the «محفوظة» row if there was one. */
  async purge(externalId: string): Promise<void> {
    if (!UPLOAD_ID_RE.test(externalId)) return;
    await this.prisma.archivedVideo.deleteMany({ where: { externalId } });
    const storage = this.mirror.objectStorage;
    if (storage === null) return;
    await storage.deletePrefix(mirrorPrefix(externalId)).catch((error: unknown) => {
      // The rows are already gone; «الفيديوهات» lists the folder as a leftover
      // and deletes it on the next try. Nothing a student sees depends on it.
      this.logger.warn({ err: error, externalId }, 'could not delete a released video');
    });
    await storage.deleteObject(uploadSourceKey(externalId)).catch(() => undefined);
  }
}
