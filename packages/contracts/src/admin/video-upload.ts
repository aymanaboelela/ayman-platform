import { z } from '@ayman/contracts/zod';
import {
  MAX_UPLOAD_VIDEO_BYTES,
  UPLOAD_ID_RE,
  UPLOAD_VIDEO_MIME,
  VideoMirrorStatusSchema,
} from '@ayman/contracts/video';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * Uploading a lecture — the browser talks to the bucket, not to us
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A two-hour lecture is gigabytes. Sending those bytes THROUGH the API would
 * mean the Node process, the reverse proxy and the container's memory all sit
 * in the path of a transfer that takes an hour on an Egyptian uplink, and a
 * dropped connection at minute fifty starts again from zero. This platform
 * has already learned the small version of that lesson once — every upload
 * used to die at 1 MB because a Server Action body has a ceiling nobody
 * documented at the call site.
 *
 * So the API never sees a video byte. It signs, the browser sends the parts
 * straight to the bucket, and the API is told when they have all landed. What
 * flows through here is three small JSON messages.
 */

/** `POST /api/admin/lessons/:id/video/upload` — open a session. */
export const VideoUploadStartSchema = z
  .object({
    /**
     * Shown back to the admin while it uploads and then thrown away. It is
     * NEVER part of an object key: a filename is attacker-influenced text
     * from a `<input type=file>` and the key is built from the upload id
     * alone.
     */
    fileName: z.string().min(1).max(255),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(MAX_UPLOAD_VIDEO_BYTES),
    /**
     * Advisory. `ffprobe` on our side is what decides whether these bytes are
     * a video; this only spares the admin an hour of uploading a PDF.
     */
    contentType: z.enum(UPLOAD_VIDEO_MIME),
    /**
     * The video this upload REPLACES, once it lands: keep it in «محفوظة» so it
     * can be put back, or delete its files. Keep by default — a choice nobody
     * made must never be the one that cannot be undone.
     */
    keepPrevious: z.boolean().default(true),
    /**
     * AES-128-encrypt the mirrored copy's TS segments — «مينفعش حد ينزّل
     * الفيديو». `true` by default, matching every lecture uploaded before this
     * field existed. Fixed for this mirror's whole life: the worker reads it
     * once, at the start of the transcode, and re-encrypting a `ready` video
     * means re-transcoding it from the source, not flipping a flag.
     */
    encrypt: z.boolean().default(true),
  })
  .strict();
export type VideoUploadStart = z.infer<typeof VideoUploadStartSchema>;

/**
 * One part's pre-signed destination. The URL carries its own credentials and
 * expiry; nothing else in the response is a secret.
 */
export const VideoUploadPartSchema = z.object({
  partNumber: z.number().int().positive(),
  url: z.string().min(1),
});

export const VideoUploadSessionSchema = z.object({
  videoId: z.string().regex(UPLOAD_ID_RE),
  /** S3's own id for the multipart upload — echoed back to complete or abort. */
  uploadId: z.string().min(1),
  partSizeBytes: z.number().int().positive(),
  parts: z.array(VideoUploadPartSchema).min(1),
  /**
   * When the signatures stop working. Surfaced so the browser can say «الرابط
   * خلص، ابدأ الرفع من الأول» instead of showing a wall of 403s on part 74.
   */
  expiresAt: z.string(),
});
export type VideoUploadSession = z.infer<typeof VideoUploadSessionSchema>;

/** `POST /api/admin/lessons/:id/video/upload/complete` */
export const VideoUploadCompleteSchema = z
  .object({
    videoId: z.string().regex(UPLOAD_ID_RE),
    uploadId: z.string().min(1),
    parts: z
      .array(
        z.object({
          partNumber: z.number().int().positive(),
          /**
           * S3 hands the browser an `ETag` header per part and refuses the
           * completion without every one of them, in order. Quotes included
           * or not — the service normalises.
           */
          etag: z.string().min(1).max(256),
        }),
      )
      .min(1)
      .max(10_000),
  })
  .strict();
export type VideoUploadComplete = z.infer<typeof VideoUploadCompleteSchema>;

/** `POST /api/admin/lessons/:id/video/upload/abort` */
export const VideoUploadAbortSchema = z
  .object({
    videoId: z.string().regex(UPLOAD_ID_RE),
    uploadId: z.string().min(1),
  })
  .strict();
export type VideoUploadAbort = z.infer<typeof VideoUploadAbortSchema>;

/**
 * «كمّل الرفع» — pick the same file again after the tab closed or the line
 * dropped, and send only what the bucket does not already have.
 *
 * `sizeBytes` is the browser's claim that this is the same file, checked
 * against what was declared when the upload opened: a different file of a
 * different size must not be stitched onto the first one's parts.
 */
export const VideoUploadResumeSchema = z
  .object({
    videoId: z.string().regex(UPLOAD_ID_RE),
    uploadId: z.string().min(1),
    sizeBytes: z.number().int().positive(),
  })
  .strict();
export type VideoUploadResume = z.infer<typeof VideoUploadResumeSchema>;

/** A session re-opened: fresh URLs for the missing parts, and the ETags of the rest. */
export const VideoUploadResumedSchema = z.object({
  videoId: z.string().regex(UPLOAD_ID_RE),
  uploadId: z.string().min(1),
  partSizeBytes: z.number().int().positive(),
  /** Only the parts still to send — empty when every part is already up. */
  parts: z.array(VideoUploadPartSchema),
  done: z.array(z.object({ partNumber: z.number().int().positive(), etag: z.string().min(1) })),
  expiresAt: z.string(),
});
export type VideoUploadResumed = z.infer<typeof VideoUploadResumedSchema>;

/**
 * What the admin screen polls while the encode runs.
 *
 * `progress` is a coarse 0–100 written by the worker between ffmpeg passes,
 * not a real-time read of the encoder — an honest bar that moves in steps
 * beats a smooth one that lies. Null before the encode starts.
 */
export const VideoUploadStatusSchema = z.object({
  status: VideoMirrorStatusSchema,
  progress: z.number().int().min(0).max(100).nullable(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  maxHeight: z.number().int().positive().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  error: z.string().nullable(),
});
export type VideoUploadStatus = z.infer<typeof VideoUploadStatusSchema>;

/* ── «حسّن الجودات» ────────────────────────────────────────────────────────
 *
 * A lecture published as it is has one rung. The owner presses a button, at
 * night, and the worker builds 720 / 480 / 360 from the rung already in the
 * bucket. This is what the screen needs to draw that button.
 *
 * `available` is false on every stack but his, and for anything that is not an
 * uploaded, ready lecture — the screen draws nothing then, rather than a
 * button that answers 404.
 */
export const VideoLadderUpgradeSchema = z.object({
  available: z.boolean(),
  /** `null` = never asked. */
  /** `waiting`: running, but stopped until the server calms down. */
  state: z.enum(['queued', 'running', 'waiting', 'done', 'failed']).nullable(),
  progress: z.number().int().min(0).max(100).nullable(),
  error: z.string().nullable(),
  /** Heights the lecture offers now, tallest first — what the owner would see in the quality menu. */
  heights: z.array(z.number().int().positive()),
  /** Heights that can still be built: shorter than the source, not already there. Tallest first. */
  buildable: z.array(z.number().int().positive()),
  /** What the last press asked for. Empty = «الكل». */
  requested: z.array(z.number().int().positive()),
});
export type VideoLadderUpgrade = z.infer<typeof VideoLadderUpgradeSchema>;

/**
 * The press itself: which of `buildable` to make. Empty or absent = all of
 * them. A height that is not buildable for this lecture is refused, not
 * silently dropped — the owner asked for something the screen should not have
 * offered.
 */
export const VideoLadderUpgradeRequestSchema = z.object({
  heights: z.array(z.number().int().positive()).max(8).optional(),
});
export type VideoLadderUpgradeRequest = z.infer<typeof VideoLadderUpgradeRequestSchema>;

/* ── «الفيديوهات» — every uploaded lecture, and what it costs ─────────────
 *
 * The one screen that answers «إيه اللي متخزّن عندنا وبكام». Until it existed,
 * a deleted lesson (or section, or course) took its database row with it and
 * left the files in the bucket — billed every month and listed nowhere.
 */

/** An upload a lesson still points at. */
export const VideoLibraryItemSchema = z.object({
  videoId: z.string(),
  status: VideoMirrorStatusSchema,
  sourceName: z.string().nullable(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  maxHeight: z.number().int().positive().nullable(),
  /** What the bucket holds for it — the ladder once ready, else the original. */
  sizeBytes: z.number().int().nonnegative().nullable(),
  updatedAt: z.string(),
  lessonId: z.string(),
  lessonTitle: z.string(),
  courseId: z.string(),
  courseTitle: z.string(),
  sectionTitle: z.string(),
  /** A «ارفع فيديو» upload still in its holding lesson — no lecture to open
   *  yet. Optional so a newer web parses an older API during a deploy. */
  library: z.boolean().optional(),
});
export type VideoLibraryItem = z.infer<typeof VideoLibraryItemSchema>;

/** Files in the bucket that no lesson points at any more. */
export const VideoLibraryOrphanSchema = z.object({
  videoId: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  lastModified: z.string().nullable(),
});
export type VideoLibraryOrphan = z.infer<typeof VideoLibraryOrphanSchema>;

/** «محفوظة» — taken off its lesson but kept, to be put back on one later. */
export const VideoLibraryArchivedSchema = z.object({
  videoId: z.string(),
  sourceName: z.string().nullable(),
  durationSeconds: z.number().int().nonnegative(),
  maxHeight: z.number().int().positive().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  fromLessonTitle: z.string().nullable(),
  fromCourseTitle: z.string().nullable(),
  archivedAt: z.string(),
});
export type VideoLibraryArchived = z.infer<typeof VideoLibraryArchivedSchema>;

/** A video lesson a kept video can be put back on. */
export const VideoLibraryTargetSchema = z.object({
  lessonId: z.string(),
  lessonTitle: z.string(),
  courseTitle: z.string(),
  sectionTitle: z.string(),
  /** It already has a video — putting this one back keeps that one in «محفوظة». */
  hasVideo: z.boolean(),
});
export type VideoLibraryTarget = z.infer<typeof VideoLibraryTargetSchema>;

export const VideoRestoreSchema = z.object({ lessonId: z.uuid() }).strict();
export type VideoRestore = z.infer<typeof VideoRestoreSchema>;

export const VideoLibrarySchema = z.object({
  items: z.array(VideoLibraryItemSchema),
  archived: z.array(VideoLibraryArchivedSchema),
  targets: z.array(VideoLibraryTargetSchema),
  orphans: z.array(VideoLibraryOrphanSchema),
  /** Every byte under `v/` and `raw/` — what the bill is computed from. */
  totalBytes: z.number().int().nonnegative(),
  /**
   * `false` when the bucket could not be listed: the lesson rows are still
   * shown, but orphans and the total are unknown rather than zero.
   */
  storageRead: z.boolean(),
});
export type VideoLibrary = z.infer<typeof VideoLibrarySchema>;

/* ─── «اختار فيديو متروفع قبل كده» ────────────────────────────────────────
 *
 * Same lecture, second course (عربي ولغات): the file is already in the
 * bucket, so the lesson points at it instead of uploading it again. One
 * video, several `lesson_videos` rows — `VideoArchiveService.release` and the
 * key endpoint already count every lesson on a video, so nothing is deleted
 * while any of them still plays it.
 *
 * Its own list, not `VideoLibrarySchema`: that one lists the bucket for
 * orphans on every read, and a picker opened from a lesson panel must not
 * cost a bucket listing each time.
 */
export const ReusableVideoSchema = z.object({
  videoId: z.string(),
  sourceName: z.string().nullable(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  maxHeight: z.number().int().positive().nullable(),
  /** Every lesson playing it now — empty for a kept one. */
  lessonIds: z.array(z.string()),
  /** Where it is (or came from), for the row's label. */
  lessonTitle: z.string().nullable(),
  sectionTitle: z.string().nullable(),
  courseTitle: z.string().nullable(),
  /** In «محفوظة» — on no lesson right now. */
  kept: z.boolean(),
  updatedAt: z.string(),
});
export type ReusableVideo = z.infer<typeof ReusableVideoSchema>;

export const ReusableVideosSchema = z.object({ videos: z.array(ReusableVideoSchema) });
export type ReusableVideos = z.infer<typeof ReusableVideosSchema>;

export const VideoAttachSchema = z.object({ lessonId: z.uuid() }).strict();
export type VideoAttach = z.infer<typeof VideoAttachSchema>;

/* ── «ارفع فيديو» من صفحة الفيديوهات ──────────────────────────────────────
 *
 * Upload first, put it on a lecture later. The upload pipeline is built around
 * a lesson row (the session, the encode, the progress all live on
 * `lesson_videos`), so a library upload gets a lesson of its own — in ONE
 * hidden course, `VIDEO_LIBRARY_COURSE_SLUG`, archived so no student list can
 * ever show it. When the encode finishes, the video moves to «محفوظة» and the
 * holding lesson is deleted; from there «رجّعه لمحاضرة» puts it on any lesson.
 * See `VideoLibraryService.createUploadSlot`.
 */
export const VIDEO_LIBRARY_COURSE_SLUG = 'video-library-uploads';

export const VideoUploadSlotSchema = z.object({ title: z.string().trim().min(1).max(200) }).strict();
export type VideoUploadSlot = z.infer<typeof VideoUploadSlotSchema>;

export const VideoUploadSlotResultSchema = z.object({ courseId: z.uuid(), lessonId: z.uuid() });
export type VideoUploadSlotResult = z.infer<typeof VideoUploadSlotResultSchema>;

/* ── «رفع فيديو» جوّه مواد الدرس ──────────────────────────────────────────
 *
 * Same transfer as the lecture's own video — pre-signed parts straight to the
 * bucket, «كمّل الرفع», the same encoder and the same protected HLS — but it
 * fills a ROW IN `lesson_resources`, never `lesson_videos`. A homework
 * solution uploaded beside a lecture must not be able to replace, park or
 * archive the lecture itself, and keeping the two on different tables makes
 * that structural rather than a rule someone has to remember.
 *
 * The material row is written when the session OPENS, with its title, in
 * state `uploading`. That is what lets the admin press «أضف مادة» once and
 * walk away: nothing has to be saved after the bytes land, so an upload that
 * finishes in another tab — or after the panel is closed — is already on the
 * lesson. Students see it only once it is `ready`.
 *
 * Complete, resume, abort and status reuse the lecture's own schemas, on
 * `/api/admin/resources/:id/video-upload/*`.
 */

/** `POST /api/admin/lessons/:id/resources/video-upload` */
export const ResourceVideoUploadStartSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(1000).nullable().default(null),
    fileName: VideoUploadStartSchema.shape.fileName,
    sizeBytes: VideoUploadStartSchema.shape.sizeBytes,
    contentType: VideoUploadStartSchema.shape.contentType,
  })
  .strict();
export type ResourceVideoUploadStart = z.infer<typeof ResourceVideoUploadStartSchema>;

/** The session, plus the material row it already created. */
export const ResourceVideoUploadSessionSchema = VideoUploadSessionSchema.extend({
  resourceId: z.uuid(),
});
export type ResourceVideoUploadSession = z.infer<typeof ResourceVideoUploadSessionSchema>;
