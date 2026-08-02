import { z } from 'zod';
// ⚠️ The PACKAGE SUBPATH, never `./video`.
//
// `apps/api` imports this module for its runtime VALUE
// (`LessonResourceInputSchema`, via `AddResourceDto`), so at real runtime it is
// Node's native ESM loader resolving these specifiers — and that loader cannot
// resolve an extensionless relative import. `./video` typechecks, lints, and
// passes every test, then throws `ERR_MODULE_NOT_FOUND` the moment the API
// boots. `@ayman/contracts/video` is a declared export in this package's
// `exports` map, which is exactly the "explicit subpath export" Global
// Constraint 5 requires. See `progress.ts` for the same hazard solved the other
// way, by keeping a local copy where only an enum was needed.
import { extractYouTubeId, VideoProviderSchema } from '@ayman/contracts/video';

export const CourseStatusSchema = z.enum(['draft', 'published', 'archived']);
export const LessonKindSchema = z.enum(['video', 'quiz', 'attachment', 'text']);
export const CompletionModeSchema = z.enum(['none', 'manual', 'on_view', 'on_grade', 'on_pass']);

export type CourseStatus = z.infer<typeof CourseStatusSchema>;
export type LessonKind = z.infer<typeof LessonKindSchema>;
export type CompletionMode = z.infer<typeof CompletionModeSchema>;

/**
 * Latin, lowercase, hyphenated. Arabic slugs percent-encode into unreadable
 * URLs that break in every share sheet, so the title is Arabic and the slug is
 * not. Reserved words are rejected so a course can never shadow a route.
 */
const RESERVED_SLUGS = new Set(['new', 'edit', 'admin', 'api', 'dev', 'me', 'sitemap', 'robots']);

export const SlugSchema = z
  .string()
  .min(3)
  .max(96)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'المُعرّف لازم يكون حروف إنجليزي صغيرة وأرقام وشرطات بس')
  .refine((value) => !RESERVED_SLUGS.has(value), 'المُعرّف ده محجوز');

/**
 * The writable surface of a course. `status`, `publishedAt`, `instructorId`,
 * `position` and every timestamp are ABSENT on purpose — publishing is a
 * separate endpoint behind a separate permission, and `.strict()` turns an
 * attempt to smuggle `status: 'published'` through the edit endpoint into a
 * 400 rather than a silent strip.
 */
const courseWritableShape = {
  slug: SlugSchema,
  title: z.string().min(3).max(160),
  subtitle: z.string().max(240).nullable().default(null),
  description: z.string().max(4000).nullable().default(null),
  systemId: z.uuid(),
  year: z.number().int().min(1).max(3),
  trackId: z.uuid().nullable().default(null),
  subjectId: z.uuid(),
  coverKey: z.string().max(255).nullable().default(null),
};

/** Mirrors the courses_year1_has_no_track CHECK so the form fails before the DB does. */
const year1HasNoTrack = (value: { year?: number; trackId?: string | null }): boolean =>
  value.year !== 1 || value.trackId == null;

export const CourseCreateSchema = z
  .object(courseWritableShape)
  .strict()
  .refine(year1HasNoTrack, { message: 'الصف الأول مالوش مسار', path: ['trackId'] });

export const CourseUpdateSchema = z
  .object(courseWritableShape)
  .strict()
  .partial()
  .refine(year1HasNoTrack, { message: 'الصف الأول مالوش مسار', path: ['trackId'] });

/** The ONLY way status changes. Guarded by `course:publish`, not `course:update`. */
export const CourseStatusPatchSchema = z.object({ status: CourseStatusSchema }).strict();

const sectionWritableShape = {
  title: z.string().min(2).max(160),
  summary: z.string().max(1000).nullable().default(null),
  isPublished: z.boolean().default(false),
};

export const SectionCreateSchema = z.object(sectionWritableShape).strict();
export const SectionUpdateSchema = z.object(sectionWritableShape).strict().partial();

/**
 * `position` is absent: the server appends at the end and the reorder endpoint
 * is the only thing that writes positions. A client that could set `position`
 * could also produce two lessons at position 3.
 *
 * `visibleFrom`, `visibleTo`, `unlocksAfterLessonId`, `viewLimit` and
 * `contentGroupId` are absent because v1 does not ENFORCE them (Global
 * Constraint 17). `.strict()` means sending one is a 400 — an admin cannot come
 * away believing they scheduled a lesson that nothing will actually hide.
 */
const lessonWritableShape = {
  title: z.string().min(2).max(200),
  kind: LessonKindSchema,
  isPublished: z.boolean().default(false),
  isFreePreview: z.boolean().default(false),
  estimatedSeconds: z.number().int().min(0).max(24 * 60 * 60).default(0),
  completionMode: CompletionModeSchema.default('manual'),
  completionMinViewSeconds: z.number().int().min(0).nullable().default(null),
  completionPassGrade: z.number().min(0).max(100).nullable().default(null),
};

const completionRuleIsCoherent = (value: {
  completionMode?: CompletionMode;
  completionMinViewSeconds?: number | null;
  completionPassGrade?: number | null;
}): boolean => {
  if (value.completionMode === 'on_view') return value.completionMinViewSeconds != null;
  if (value.completionMode === 'on_grade' || value.completionMode === 'on_pass') {
    return value.completionPassGrade != null;
  }
  return true;
};

export const LessonCreateSchema = z
  .object(lessonWritableShape)
  .strict()
  .refine(completionRuleIsCoherent, {
    message: 'قاعدة إتمام الدرس ناقصة قيمتها',
    path: ['completionMode'],
  });

export const LessonUpdateSchema = z
  .object(lessonWritableShape)
  .strict()
  .partial()
  .refine(completionRuleIsCoherent, {
    message: 'قاعدة إتمام الدرس ناقصة قيمتها',
    path: ['completionMode'],
  });

/** 64 KiB. Larger than any real lesson, small enough that a paste bomb is a 400. */
export const MAX_RICH_TEXT_CHARS = 65_536;

export const LessonTextInputSchema = z
  .object({ bodyHtml: z.string().min(1).max(MAX_RICH_TEXT_CHARS) })
  .strict();

export const LessonResourceKindSchema = z.enum([
  'presentation',
  'video',
  'document',
  'link',
]);
export type LessonResourceKind = z.infer<typeof LessonResourceKindSchema>;

/** 200 MiB — a lecture deck with embedded imagery, not a video file. */
export const MAX_RESOURCE_BYTES = 200 * 1024 * 1024;

/**
 * The transform's output, declared as ONE object type rather than left to
 * inference.
 *
 * Inference would produce a union of three branch shapes (`storageKey: string`
 * in one, `storageKey: null` in another), and `createZodDto` cannot build a DTO
 * class from a union — it needs statically known members. Annotating the
 * transform's return with this interface collapses the three branches into the
 * single shape the service and the Prisma `create` both already expect: every
 * payload column present, with the ones foreign to the declared kind set to
 * null.
 */
export interface LessonResourceInput {
  kind: LessonResourceKind;
  title: string;
  description: string | null;
  storageKey: string | null;
  filename: string | null;
  mime: string | null;
  sizeBytes: number | null;
  videoProvider: 'youtube' | null;
  videoExternalId: string | null;
  linkUrl: string | null;
}

/**
 * One flat object with a `kind`-driven transform, NOT a discriminated union:
 * the video branch has to run `extractYouTubeId`, and a branch carrying a
 * `.transform()` is no longer a plain object schema, which is exactly what
 * `z.discriminatedUnion` requires. `LessonVideoInputSchema` solves the same
 * problem the same way.
 *
 * The transform is also what enforces mutual exclusion: it returns ONLY the
 * columns legal for the declared kind, so a payload smuggling a `linkUrl` onto
 * a document cannot reach the service — and the database CHECK behind it never
 * has to be the first thing that notices.
 */
export const LessonResourceInputSchema = z
  .object({
    kind: LessonResourceKindSchema,
    title: z.string().min(1).max(200),
    description: z.string().max(1000).nullable().default(null),
    // file payload — presentation | document
    storageKey: z.string().min(1).max(255).optional(),
    filename: z.string().min(1).max(255).optional(),
    mime: z.string().min(3).max(127).optional(),
    sizeBytes: z.number().int().positive().max(MAX_RESOURCE_BYTES).optional(),
    // video payload — a URL on the way in, an 11-char id on the way out
    provider: VideoProviderSchema.optional(),
    url: z.string().min(1).max(2048).optional(),
    // link payload
    linkUrl: z.string().min(1).max(2048).optional(),
  })
  .strict()
  .transform((value, ctx): LessonResourceInput => {
    const common = {
      kind: value.kind,
      title: value.title,
      description: value.description,
    };

    if (value.kind === 'presentation' || value.kind === 'document') {
      if (
        value.storageKey === undefined ||
        value.filename === undefined ||
        value.mime === undefined ||
        value.sizeBytes === undefined
      ) {
        ctx.addIssue({ code: 'custom', message: 'لازم ترفع الملف الأول', path: ['storageKey'] });
        return z.NEVER;
      }
      if (value.linkUrl !== undefined || value.url !== undefined) {
        ctx.addIssue({ code: 'custom', message: 'الملف مايجيش معاه رابط', path: ['kind'] });
        return z.NEVER;
      }
      return {
        ...common,
        storageKey: value.storageKey,
        filename: value.filename,
        mime: value.mime,
        sizeBytes: value.sizeBytes,
        videoProvider: null,
        videoExternalId: null,
        linkUrl: null,
      };
    }

    if (value.kind === 'video') {
      if (value.provider !== 'youtube') {
        ctx.addIssue({
          code: 'custom',
          message: 'النسخة الحالية بتدعم فيديوهات يوتيوب بس',
          path: ['provider'],
        });
        return z.NEVER;
      }
      const videoExternalId = value.url === undefined ? null : extractYouTubeId(value.url);
      if (videoExternalId === null) {
        ctx.addIssue({ code: 'custom', message: 'رابط يوتيوب غير صالح', path: ['url'] });
        return z.NEVER;
      }
      return {
        ...common,
        storageKey: null,
        filename: null,
        mime: null,
        sizeBytes: null,
        videoProvider: 'youtube' as const,
        videoExternalId,
        linkUrl: null,
      };
    }

    // kind === 'link'. `startsWith('https://')` rather than a URL parse: it
    // rejects `javascript:` and `data:` by construction, and mirrors the
    // database CHECK exactly so the two can never disagree about what is legal.
    if (value.linkUrl === undefined || !value.linkUrl.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', message: 'الرابط لازم يبدأ بـ https', path: ['linkUrl'] });
      return z.NEVER;
    }
    if (value.storageKey !== undefined || value.url !== undefined) {
      ctx.addIssue({ code: 'custom', message: 'الرابط مايجيش معاه ملف', path: ['kind'] });
      return z.NEVER;
    }
    return {
      ...common,
      storageKey: null,
      filename: null,
      mime: null,
      sizeBytes: null,
      videoProvider: null,
      videoExternalId: null,
      linkUrl: value.linkUrl,
    };
  });

/**
 * Title and description only. Changing a resource's KIND means deleting it and
 * adding the right one — a PATCH that turned a link into a file would have to
 * null three columns and populate four, which is a create wearing a costume.
 */
export const LessonResourceUpdateSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).nullable().optional(),
  })
  .strict();

/**
 * The whole ordered array, in one request. Not a `{id, from, to}` delta and not
 * one request per moved row: dragging one lesson from position 1 to position 40
 * changes 40 positions, and 40 requests is 40 chances to interleave with another
 * editor and leave the section in a state neither of them intended.
 */
export const ReorderSchema = z
  .object({
    orderedIds: z
      .array(z.uuid())
      .min(1)
      .max(500)
      .refine((ids) => new Set(ids).size === ids.length, 'فيه عنصر متكرر في الترتيب'),
  })
  .strict();

export type CourseCreateInput = z.infer<typeof CourseCreateSchema>;
export type CourseUpdateInput = z.infer<typeof CourseUpdateSchema>;
export type CourseStatusPatchInput = z.infer<typeof CourseStatusPatchSchema>;
export type SectionCreateInput = z.infer<typeof SectionCreateSchema>;
export type SectionUpdateInput = z.infer<typeof SectionUpdateSchema>;
export type LessonCreateInput = z.infer<typeof LessonCreateSchema>;
export type LessonUpdateInput = z.infer<typeof LessonUpdateSchema>;
export type LessonTextInput = z.infer<typeof LessonTextInputSchema>;
export type LessonResourceUpdateInput = z.infer<typeof LessonResourceUpdateSchema>;
export type ReorderInput = z.infer<typeof ReorderSchema>;
