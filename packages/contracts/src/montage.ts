import { z } from '@ayman/contracts/zod';
import { MAX_UPLOAD_VIDEO_BYTES, UPLOAD_ID_RE, UPLOAD_VIDEO_MIME } from '@ayman/contracts/video';
import { normalizeEgyptianPhone } from '@ayman/contracts/phone';

/**
 * «المونتاج» — where the video editor hands finished videos over.
 *
 * The editor exports a lecture and uploads it here, untouched; the instructor
 * downloads the file as it arrived, or puts it on a lesson (a new one, or one
 * that already exists) — which is when the platform's own encode runs.
 *
 * ## Why this is not «الفيديوهات»
 *
 * Everything in «الفيديوهات» is already a lecture: an HLS ladder whose source
 * file was deleted the moment the ladder landed. A hand-over is the opposite
 * on both counts — it is the ORIGINAL file, kept as it arrived so it can be
 * downloaded again, and it is not on any lesson until the instructor decides
 * it should be. Putting one on a lesson copies the original (server side, no
 * re-upload) into that lesson's upload slot, so the hand-over survives the
 * encode deleting its copy, and can be put on a second lesson later.
 *
 * Same bucket, same direct-to-storage multipart upload as a lecture's — a
 * two-hour export is gigabytes, and the API never sees a video byte.
 *
 * No relative imports in this file, for the same reason as `designs.ts`: the
 * API loads it at runtime through the `@ayman/contracts/montage` subpath.
 */

/**
 * The largest file the editor can hand over. The same ceiling as a lecture's
 * own upload, on purpose: a hand-over that fits here but not there could be
 * downloaded and never put on a lesson, and the editor would only find out
 * after an hour of uploading.
 */
export const MAX_MONTAGE_BYTES = MAX_UPLOAD_VIDEO_BYTES;

export const MONTAGE_TITLE_MAX = 200;
export const MONTAGE_NOTE_MAX = 1000;

/**
 * Where a hand-over's original lives in the bucket. Built from a 32-hex id
 * the API mints, never from anything a browser sent — the same rule as
 * `uploadSourceKey`, and a different root so «الفيديوهات», which lists `raw/`
 * and `v/` to find files nothing points at, never offers a hand-over for
 * deletion.
 */
export function montageSourceKey(storageId: string): string {
  if (!UPLOAD_ID_RE.test(storageId)) {
    throw new Error('montageSourceKey requires a 32-character storage id');
  }
  return `montage/${storageId}/source`;
}

/**
 * `uploading` — the row exists, the parts are still on their way (or the tab
 * closed and «كمّل الرفع» has not been pressed yet). `ready` — sealed in the
 * bucket, downloadable, can go on a lesson.
 */
export const MontageStatusSchema = z.enum(['uploading', 'ready']);
export type MontageStatus = z.infer<typeof MontageStatusSchema>;

const Title = z.string().trim().min(1).max(MONTAGE_TITLE_MAX);
const Note = z.string().trim().max(MONTAGE_NOTE_MAX);

export const MontageVideoSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  note: z.string().nullable(),
  fileName: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  status: MontageStatusSchema,
  /** The account that uploaded it — the editor, or the instructor themself. */
  uploadedBy: z.string().nullable(),
  /** Its id, so the instructor's screen can show one editor's work at a time. */
  uploadedById: z.string().nullable(),
  createdAt: z.string(),
  /** The lesson it was last put on, while that lesson still exists. */
  lesson: z
    .object({
      lessonId: z.string(),
      lessonTitle: z.string(),
      courseId: z.string(),
      courseTitle: z.string(),
      at: z.string(),
    })
    .nullable(),
});
export type MontageVideo = z.infer<typeof MontageVideoSchema>;

export const MontageListSchema = z.object({
  videos: z.array(MontageVideoSchema),
  /** Every byte the hand-overs hold — the bucket is billed by it. */
  totalBytes: z.number().int().nonnegative(),
});
export type MontageList = z.infer<typeof MontageListSchema>;

/** `POST /api/montage/uploads` — open a session. */
export const MontageUploadStartSchema = z
  .object({
    title: Title,
    note: Note.optional(),
    /** Shown back, never part of a key — see `VideoUploadStartSchema.fileName`. */
    fileName: z.string().min(1).max(255),
    sizeBytes: z.number().int().positive().max(MAX_MONTAGE_BYTES),
    contentType: z.enum(UPLOAD_VIDEO_MIME),
  })
  .strict();
export type MontageUploadStart = z.infer<typeof MontageUploadStartSchema>;

const Part = z.object({ partNumber: z.number().int().positive(), url: z.string().min(1) });
const Etag = z.object({ partNumber: z.number().int().positive(), etag: z.string().min(1) });

/**
 * A session, opened or reopened. `videoId` is the hand-over's row id — the
 * upload manager's word for «what this upload fills»; `uploadId` is the
 * bucket's own multipart id.
 */
export const MontageUploadSessionSchema = z.object({
  videoId: z.uuid(),
  uploadId: z.string().min(1),
  partSizeBytes: z.number().int().positive(),
  parts: z.array(Part),
  /** Parts the bucket already holds — a resumed upload starts from these. */
  done: z.array(Etag).optional(),
  expiresAt: z.string(),
});
export type MontageUploadSession = z.infer<typeof MontageUploadSessionSchema>;

/** `POST /api/montage/:id/upload/resume` — the same file, picked again. */
export const MontageUploadResumeSchema = z.object({ sizeBytes: z.number().int().positive() }).strict();
export type MontageUploadResume = z.infer<typeof MontageUploadResumeSchema>;

/** `POST /api/montage/:id/upload/complete` — seal it. */
export const MontageUploadCompleteSchema = z
  .object({ uploadId: z.string().min(1), parts: z.array(Etag).min(1).max(10_000) })
  .strict();
export type MontageUploadComplete = z.infer<typeof MontageUploadCompleteSchema>;

/** `PATCH /api/montage/:id` — rename, or change the note to the instructor. */
export const MontageVideoPatchSchema = z
  .object({ title: Title.optional(), note: Note.nullable().optional() })
  .strict()
  .refine((value) => value.title !== undefined || value.note !== undefined, { message: 'nothing to change' });
export type MontageVideoPatch = z.infer<typeof MontageVideoPatchSchema>;

/** `GET /api/montage/:id/download` — a short-lived link straight to the bucket. */
export const MontageDownloadSchema = z.object({ url: z.string().min(1), expiresAt: z.string() });
export type MontageDownload = z.infer<typeof MontageDownloadSchema>;

/**
 * `POST /api/admin/montage/:id/publish` — «حطه في درس».
 *
 * A NEW lesson is created as a draft at the end of the chosen section: the
 * instructor publishes it when it is ready, the same as one made by hand. An
 * EXISTING lesson keeps everything but its video, and the video it played
 * goes to «محفوظة» — never deleted.
 */
export const MontagePublishSchema = z
  .object({
    /** A NEW lesson: the section it goes at the end of, and its title. */
    sectionId: z.uuid().optional(),
    // min 2: a lesson title's own floor (`LessonCreateSchema`).
    title: Title.min(2).optional(),
    /** An EXISTING video lesson instead. */
    lessonId: z.uuid().optional(),
    /** AES-128 on the encoded copy — «مينفعش حد ينزّل الفيديو», as on any upload. */
    encrypt: z.boolean().default(true),
  })
  .strict()
  // One object rather than a discriminated union: a Nest DTO class cannot
  // extend a union, and exactly-one-target is a refinement either way.
  .refine(
    (value) =>
      value.lessonId !== undefined
        ? value.sectionId === undefined && value.title === undefined
        : value.sectionId !== undefined && value.title !== undefined,
    { message: 'اختار درس موجود، أو وحدة وعنوان لدرس جديد' },
  );
export type MontagePublish = z.infer<typeof MontagePublishSchema>;

export const MontagePublishResultSchema = z.object({ courseId: z.string(), lessonId: z.string() });
export type MontagePublishResult = z.infer<typeof MontagePublishResultSchema>;

/** `GET /api/admin/montage/targets` — every place a hand-over can go. */
export const MontageTargetsSchema = z.object({
  courses: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      status: z.string(),
      sections: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          /** Video lessons only — nothing else can hold one. */
          lessons: z.array(z.object({ id: z.string(), title: z.string(), hasVideo: z.boolean() })),
        }),
      ),
    }),
  ),
});
export type MontageTargets = z.infer<typeof MontageTargetsSchema>;

/**
 * ══════════════════════════════════════════════════════════════════════════
 * «المونتيرين» — the editor accounts, managed from the dashboard
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Every editor is their own account, so the instructor can see whose video is
 * whose, change one password, or stop one person, without touching the rest.
 * The routes act on `video_editor` accounts ONLY: a password set from here can
 * never land on a student, an assistant or the instructor.
 */
export const MontageEditorSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  /** Stopped: cannot sign in, every session already ended. */
  disabled: z.boolean(),
  videoCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  lastUploadAt: z.string().nullable(),
  createdAt: z.string(),
});
export type MontageEditor = z.infer<typeof MontageEditorSchema>;

export const MontageEditorsSchema = z.object({ editors: z.array(MontageEditorSchema) });
export type MontageEditors = z.infer<typeof MontageEditorsSchema>;

/** Long enough that a guess is not a sign-in, short enough to say over the phone. */
export const MONTAGE_EDITOR_PASSWORD_MIN = 8;

const EditorPassword = z
  .string()
  .min(MONTAGE_EDITOR_PASSWORD_MIN, 'كلمة السر ٨ حروف أو أرقام على الأقل')
  .max(128);

/** `POST /api/admin/montage/editors` — a new editor, ready to sign in. */
export const MontageEditorCreateSchema = z
  .object({
    name: z.string().trim().min(2, 'اكتب اسم المونتير').max(80),
    /** Typed the way people type it (`010…`); stored E.164, as sign-in looks it up. */
    phone: z
      .string()
      .trim()
      .transform((value, ctx) => {
        const normalized = normalizeEgyptianPhone(value);
        if (normalized === null) {
          ctx.addIssue({ code: 'custom', message: 'رقم موبايل مصري صحيح' });
          return z.NEVER;
        }
        return normalized;
      }),
    password: EditorPassword,
  })
  .strict();
export type MontageEditorCreate = z.input<typeof MontageEditorCreateSchema>;

/** `POST /api/admin/montage/editors/:id/password`. */
export const MontageEditorPasswordSchema = z.object({ password: EditorPassword }).strict();
export type MontageEditorPassword = z.infer<typeof MontageEditorPasswordSchema>;
