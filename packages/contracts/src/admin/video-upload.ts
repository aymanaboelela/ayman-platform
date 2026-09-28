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
});
export type VideoLibraryItem = z.infer<typeof VideoLibraryItemSchema>;

/** Files in the bucket that no lesson points at any more. */
export const VideoLibraryOrphanSchema = z.object({
  videoId: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  lastModified: z.string().nullable(),
});
export type VideoLibraryOrphan = z.infer<typeof VideoLibraryOrphanSchema>;

export const VideoLibrarySchema = z.object({
  items: z.array(VideoLibraryItemSchema),
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
