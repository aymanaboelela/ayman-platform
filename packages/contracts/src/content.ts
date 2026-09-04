import { partialWithoutDefaults } from '@ayman/contracts/partial';
import { z } from '@ayman/contracts/zod';
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
import {
  extractYouTubeId,
  VideoEmbedStatusSchema,
  VideoProviderSchema,
} from '@ayman/contracts/video';
// Same subpath rule as the line above — never a relative specifier.
import { MAX_DOCUMENT_BYTES } from '@ayman/contracts/admin/media';

export const CourseStatusSchema = z.enum(['draft', 'published', 'archived']);
/**
 * How hard a course is being pushed — the badge on its card, nothing more.
 *
 * Ordered loudest-first, which is the order the admin's dropdown offers them
 * in. `null` (no badge) is the default and is most courses: a grid where every
 * card shouts has no emphasis left to give.
 */
export const CourseEmphasisSchema = z.enum(['required', 'recommended', 'optional']);
export const LessonKindSchema = z.enum(['video', 'quiz', 'attachment', 'text']);
export const CompletionModeSchema = z.enum(['none', 'manual', 'on_view', 'on_grade', 'on_pass']);

export type CourseStatus = z.infer<typeof CourseStatusSchema>;
export type CourseEmphasis = z.infer<typeof CourseEmphasisSchema>;
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
/**
 * مدارس عام / مدارس لغات, the pair that appears on both a course and a lesson.
 *
 * Defaults match the columns': both true, i.e. "الاتنين". A caller that says
 * nothing about streams gets content everybody can see, which is the only
 * default that cannot silently hide something from half the audience.
 */
export const streamShape = {
  forGeneral: z.boolean().default(true),
  forLanguages: z.boolean().default(true),
};

/**
 * Mirrors the `*_serves_a_stream` CHECKs. `path: ['forGeneral']` is not
 * decorative — a refine on the object with no path produces an issue at
 * `path: []`, which react-hook-form cannot attach to any field, and the form
 * would then refuse to submit while showing no error at all. Same trap the
 * question schema documents at length.
 */
export const servesAStream = (value: {
  forGeneral?: boolean;
  forLanguages?: boolean;
}): boolean => value.forGeneral !== false || value.forLanguages !== false;

// No `as const` on `path`: zod types it as the mutable `PropertyKey[]`, and a
// readonly tuple is not assignable to it.
export const STREAM_REFINEMENT = {
  message: 'لازم يتحدد عام أو لغات أو الاتنين',
  path: ['forGeneral'],
};

/**
 * What the ADMIN FORM submits — one of three, rather than the two booleans the
 * database stores.
 *
 * Two checkboxes can be unticked into a state the CHECK rejects, so the form
 * would have to police it and tell the teacher off for a click the UI let them
 * make. Three mutually exclusive options make that state unreachable instead
 * of merely invalid, which is the same move the CHECK makes one layer down.
 *
 * The pair of converters lives here, next to the schema, so the form that
 * writes the choice and the action that expands it can never disagree about
 * what «الاتنين» means.
 */
export const StreamChoiceSchema = z.enum(['general', 'languages', 'both']);
export type StreamChoice = z.infer<typeof StreamChoiceSchema>;

export const streamFlagsOf = (choice: StreamChoice): { forGeneral: boolean; forLanguages: boolean } => ({
  forGeneral: choice !== 'languages',
  forLanguages: choice !== 'general',
});

/** Total: `false,false` cannot exist behind the CHECK, and reads as `both`. */
export const streamChoiceOf = (flags: { forGeneral: boolean; forLanguages: boolean }): StreamChoice => {
  if (flags.forGeneral && !flags.forLanguages) return 'general';
  if (!flags.forGeneral && flags.forLanguages) return 'languages';
  return 'both';
};

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
  /**
   * Whether the course needs an access grant of its own — «مقفول» in the admin.
   *
   * `false` is the default and is every course today: the platform-wide "free
   * for everyone" grant opens it. `true` means only a grant naming this course
   * (or its subject) does, which is how a paid course is expressed while there
   * is no payment system to charge through.
   *
   * It is NOT a price and it is NOT `isFree` — see the column's own note in
   * `schema.prisma` for why the distinction is load-bearing. Entitlement stays
   * in `AccessGrant`; this only decides which scopes satisfy the course.
   */
  requiresGrant: z.boolean().default(false),
  /**
   * The badge on the course card, and the one line under it.
   *
   * PRESENTATION ONLY — see `CourseEmphasis` in schema.prisma. Nothing gates
   * on either field: a course marked «اختياري» is exactly as reachable as one
   * marked «إجباري», and the student is simply told which is which.
   *
   * The note is free text rather than a second enum because what it has to say
   * is "for WHOM" — «أساسي لأولى بكالوريا · اختياري لتانية» — and that varies
   * per course in a way a fixed vocabulary cannot cover.
   *
   * `emphasisNote` without `emphasis` is refused below, mirroring the
   * `courses_note_needs_emphasis` CHECK: the note is rendered next to the
   * badge, so a note with no badge is a sentence the card cannot place.
   */
  emphasis: CourseEmphasisSchema.nullable().default(null),
  emphasisNote: z.string().trim().min(1).max(80).nullable().default(null),
  /**
   * The «لسه هننزل قريبًا» message for a course with zero real lectures
   * published yet — shown only while it is genuinely empty (the same
   * `isPublished && section.isPublished && kind != 'quiz'` rule
   * `DashboardService`/`CourseProgressService`/`CatalogService` already
   * share), never a lock and never an access decision.
   *
   * `null` is the default and does not mean "say nothing" — the course page
   * and the enrolled-course card fall back to a stock sentence
   * (`copy.course.comingSoonDefaultNote`) so the state is always explained.
   * This field only lets an instructor override that wording per course.
   */
  comingSoonNote: z.string().trim().min(1).max(240).nullable().default(null),
  /**
   * «ميعاد المحاضرة» — the live-lesson time, as one line the teacher writes,
   * shown to the enrolled student in the dashboard's own hero band.
   *
   * FREE TEXT, deliberately, and not a weekday + a time. The ask that produced
   * it is «هضيف السبت الساعة تمانية… طيب لو لغات، فيبقى يوم الحد» — two courses
   * on two different nights, typed by the person who teaches both. A structured
   * pair would buy sorting and localisation nothing on this platform asks for,
   * and it could not express «السبت والتلات ٨ م» or «الأسبوع ده استثناءً الأحد»
   * — each of which is otherwise a phone call. See `Course.scheduleNote` in
   * schema.prisma for the full argument; this schema only mirrors it.
   *
   * `null` is «مفيش ميعاد معلن» and is every course until somebody writes one —
   * the band then renders nothing at all rather than an empty row. 120 is the
   * `courses_schedule_note_length` CHECK, and it is a LAYOUT ceiling: the line
   * gets one row in the hero on a 390px phone, and a longer sentence wraps to
   * three and pushes the student's own progress off the first screen.
   */
  scheduleNote: z.string().trim().min(1).max(120).nullable().default(null),
  /** اكتمل نزول المحتوى. `false` on create — a brand-new course has nothing
   *  in it, so it certainly is not finished. */
  contentComplete: z.boolean().default(false),
  /**
   * Subscription prices, EGP CENTS — `null` means that plan is not for sale.
   * Independent of each other; a course can sell any subset of them.
   *
   * Display/checkout data only, same distinction `requiresGrant`'s note
   * draws for itself: nothing here decides access, `AccessGrant` still does.
   * `pricedRequiresGrant` below mirrors the `courses_priced_requires_grant`
   * CHECK so a course put up for sale with no grant behind it fails in the
   * form rather than at the database.
   */
  monthlyPriceCents: z.number().int().min(0).nullable().default(null),
  quarterlyPriceCents: z.number().int().min(0).nullable().default(null),
  /** A full-year subscription — same shape as the two above, and the same
   *  date-based expiry math (12 months instead of 1 or 3). See
   *  `Course.yearlyPriceCents`'s own doc in schema.prisma. */
  yearlyPriceCents: z.number().int().min(0).nullable().default(null),
  /**
   * الكتاب الورقي — a printed textbook this course ships home. `null` =
   * no book to order, and independent of the subscription prices above: a
   * free course can sell a book, and a priced one can sell none.
   *
   * `bookNeedsPriceAndTitle` below mirrors the
   * `courses_book_needs_price_and_title` CHECK, same convention as
   * `pricedRequiresGrant` for the subscription prices.
   */
  bookTitle: z.string().trim().min(1).max(160).nullable().default(null),
  /** EGP cents — `null` exactly when `bookTitle` is `null`. */
  bookPriceCents: z.number().int().min(0).nullable().default(null),
  ...streamShape,
};

/** Mirrors the `courses_priced_requires_grant` CHECK so the form fails first. */
const pricedRequiresGrant = (value: {
  monthlyPriceCents?: number | null;
  quarterlyPriceCents?: number | null;
  yearlyPriceCents?: number | null;
  requiresGrant?: boolean;
}): boolean =>
  (value.monthlyPriceCents == null &&
    value.quarterlyPriceCents == null &&
    value.yearlyPriceCents == null) ||
  value.requiresGrant === true;

/** Mirrors the `courses_book_needs_price_and_title` CHECK so the form fails
 *  first. Both set or both `null` — never one without the other. */
const bookNeedsPriceAndTitle = (value: {
  bookTitle?: string | null;
  bookPriceCents?: number | null;
}): boolean => (value.bookTitle == null) === (value.bookPriceCents == null);

/** Mirrors the `courses_note_needs_emphasis` CHECK so the form fails first. */
const noteNeedsEmphasis = (value: {
  emphasis?: CourseEmphasis | null;
  emphasisNote?: string | null;
}): boolean => value.emphasisNote == null || value.emphasis != null;

/** Mirrors the courses_year1_has_no_track CHECK so the form fails before the DB does. */
const year1HasNoTrack = (value: { year?: number; trackId?: string | null }): boolean =>
  value.year !== 1 || value.trackId == null;

export const CourseCreateSchema = z
  .object(courseWritableShape)
  .strict()
  .refine(year1HasNoTrack, { message: 'الصف الأول مالوش مسار', path: ['trackId'] })
  .refine(noteNeedsEmphasis, { message: 'الملاحظة محتاجة شارة', path: ['emphasisNote'] })
  .refine(servesAStream, STREAM_REFINEMENT)
  .refine(pricedRequiresGrant, { message: 'الكورس المدفوع لازم يبقى مقفول', path: ['requiresGrant'] })
  .refine(bookNeedsPriceAndTitle, { message: 'الكتاب محتاج اسم وسعر مع بعض', path: ['bookPriceCents'] });

// `partialWithoutDefaults`, not `.partial()`: see the helper for why a
// "partial" schema built over a shape with defaults writes fields the caller
// never sent.
export const CourseUpdateSchema = z
  .object(partialWithoutDefaults(courseWritableShape))
  .strict()
  .refine(year1HasNoTrack, { message: 'الصف الأول مالوش مسار', path: ['trackId'] })
  .refine(noteNeedsEmphasis, { message: 'الملاحظة محتاجة شارة', path: ['emphasisNote'] })
  // On the PARTIAL schema this catches only an explicit `{forGeneral: false,
  // forLanguages: false}`. A patch that unsets one and omits the other still
  // reaches the CHECK, which is the backstop — and the reason the CHECK is
  // in the database rather than only here.
  .refine(servesAStream, STREAM_REFINEMENT);
// `pricedRequiresGrant` is deliberately NOT repeated here. On a partial patch
// `requiresGrant` is routinely absent — the admin is only touching a price —
// and the refine would then compare an undefined field against a persisted
// one it cannot see, rejecting perfectly good patches. `CourseService.update`
// resolves the PATCH against the CURRENT row instead (the only place that
// actually knows it) and auto-sets `requiresGrant: true` there; the database
// CHECK is what still catches a request that bypasses the service.
//
// `bookNeedsPriceAndTitle` is deliberately NOT repeated here either, for the
// identical reason: a patch touching only `bookPriceCents` (a price
// correction with no title change) is routine, and `CourseService.update`
// resolves it against the current row the same way it does for
// `pricedRequiresGrant`.

/**
 * Designating the course's final exam. `null` clears it.
 *
 * Its own endpoint rather than a field on `CourseUpdateSchema`, for the same
 * reason `status` has one: it is not an edit to the course's description, it
 * changes what the progression gate does, and `.strict()` on the update schema
 * turns an attempt to smuggle it through the edit form into a 400.
 */
export const CourseExamPatchSchema = z
  .object({ examLessonId: z.uuid().nullable() })
  .strict();

/** The ONLY way status changes. Guarded by `course:publish`, not `course:update`. */
export const CourseStatusPatchSchema = z.object({ status: CourseStatusSchema }).strict();

/**
 * The title the scaffolded exam's section and lesson both carry.
 *
 * A shared constant rather than a literal in the service, because the E2E spec
 * asserts on it: a test carrying its own copy of a display string keeps
 * passing forever after the string changes, which is the opposite of what it
 * is for.
 */
export const EXAM_SECTION_TITLE = 'الامتحان النهائي';

/**
 * What `POST /admin/courses/:id/exam/scaffold` returns.
 *
 * `created` distinguishes "I built you an exam" from "you already had one and
 * here it is" — the endpoint is idempotent, and the UI wants to say something
 * different in each case.
 */
export const ExamScaffoldResultSchema = z
  .object({ quizId: z.uuid(), lessonId: z.uuid(), created: z.boolean() })
  .strict();

export type ExamScaffoldResult = z.infer<typeof ExamScaffoldResultSchema>;

const sectionWritableShape = {
  title: z.string().min(2).max(160),
  summary: z.string().max(1000).nullable().default(null),
  isPublished: z.boolean().default(false),
  /** Which term (الترم) this section belongs to — `null` = not assigned to
   *  either half of the course. See `CourseTerm`'s model doc. */
  termId: z.uuid().nullable().default(null),
};

export const SectionCreateSchema = z.object(sectionWritableShape).strict();
export const SectionUpdateSchema = z
  .object(partialWithoutDefaults(sectionWritableShape))
  .strict();

/**
 * الترم الأول / الترم الثاني — see `CourseTerm`'s model doc in schema.prisma
 * for the full reasoning.
 *
 * `position` is absent from both writable shapes for the same reason it is
 * absent from `sectionWritableShape` — the server appends new terms in
 * order, and there is no reorder endpoint for terms in v1 (courses have at
 * most a small, fixed number of them, unlike sections).
 *
 * `isOpen` is absent from `TermCreateSchema` on purpose — a brand-new term is
 * always created open, so admin action is closing an EXISTING one, never
 * opting a new one out of being reachable at all.
 */
const termWritableShape = {
  title: z.string().min(2).max(160),
  /** `null` = not for sale. See `CourseTerm.priceCents`'s own note. */
  priceCents: z.number().int().min(0).nullable().default(null),
};

export const TermCreateSchema = z.object(termWritableShape).strict();
/** Title/price only — deliberately cannot flip `isOpen`. See
 *  `TermSetOpenSchema`, its own endpoint and its own audit action: closing a
 *  term can bulk-revoke live grants, which is a materially different act
 *  from renaming it and earns a route of its own rather than riding on a
 *  generic field PATCH. */
export const TermUpdateSchema = z.object(partialWithoutDefaults(termWritableShape)).strict();
export const TermSetOpenSchema = z.object({ isOpen: z.boolean() }).strict();
export type TermCreateInput = z.infer<typeof TermCreateSchema>;
export type TermUpdateInput = z.infer<typeof TermUpdateSchema>;
export type TermSetOpenInput = z.infer<typeof TermSetOpenSchema>;

export const CourseTermSchema = z.object({
  id: z.uuid(),
  courseId: z.uuid(),
  title: z.string(),
  position: z.number().int(),
  isOpen: z.boolean(),
  priceCents: z.number().int().nullable(),
});
export type CourseTerm = z.infer<typeof CourseTermSchema>;

/** What closing a term returns — the admin editor's own confirmation of what
 *  it actually did, not just that the PATCH succeeded. See
 *  `TermService.setOpen`'s own note on why this is worth a real number
 *  rather than a bare 200. */
export const TermSetOpenResultSchema = z.object({
  term: CourseTermSchema,
  /** How many LIVE `scope: term` grants were just revoked — `0` on every
   *  reopen, and `0` on a close that finds nobody currently holding one. */
  revokedGrantCount: z.number().int().min(0),
});
export type TermSetOpenResult = z.infer<typeof TermSetOpenResultSchema>;

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
  ...streamShape,
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
  })
  .refine(servesAStream, STREAM_REFINEMENT);

export const LessonUpdateSchema = z
  .object(partialWithoutDefaults(lessonWritableShape))
  .strict()
  .refine(completionRuleIsCoherent, {
    message: 'قاعدة إتمام الدرس ناقصة قيمتها',
    path: ['completionMode'],
  })
  .refine(servesAStream, STREAM_REFINEMENT);

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

/**
 * The largest `sizeBytes` a resource may claim.
 *
 * DERIVED from the upload cap rather than restated, because the two must move
 * together: a value between them would let a file pass the upload gate and
 * then fail resource creation (or the reverse), and the failure would look
 * like a bug in whichever half ran second. There is one number.
 */
export const MAX_RESOURCE_BYTES = MAX_DOCUMENT_BYTES;

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
export type CourseExamPatchInput = z.infer<typeof CourseExamPatchSchema>;
export type SectionCreateInput = z.infer<typeof SectionCreateSchema>;
export type SectionUpdateInput = z.infer<typeof SectionUpdateSchema>;
export type LessonCreateInput = z.infer<typeof LessonCreateSchema>;
export type LessonUpdateInput = z.infer<typeof LessonUpdateSchema>;
export type LessonTextInput = z.infer<typeof LessonTextInputSchema>;
export type LessonResourceUpdateInput = z.infer<typeof LessonResourceUpdateSchema>;
export type ReorderInput = z.infer<typeof ReorderSchema>;

/**
 * Why a lecture stayed a draft when the course was published in one press.
 *
 * Named rather than counted: «٣ محاضرات ما اتنشرتش» tells the instructor there
 * is a problem and not where it is, and every one of these is fixable in the
 * panel the name points at.
 */
export const PublishSkipReasonSchema = z.enum([
  /** A video lecture with no `lesson_videos` row — publishing it produces the
   *  blank-player page on purpose, which is the one outcome to avoid. */
  'noVideo',
  'noText',
  'noResources',
  /** The quiz exists but is not published. Publishing a quiz runs its own
   *  validation (every pool can fill its pickCount, marks sum above zero), and
   *  the cascade must not become a way around it. */
  'quizNotPublished',
]);
export type PublishSkipReason = z.infer<typeof PublishSkipReasonSchema>;

export const PublishAllResultSchema = z.object({
  publishedLessons: z.number().int().min(0),
  publishedSections: z.number().int().min(0),
  skipped: z.array(
    z.object({ id: z.uuid(), title: z.string(), reason: PublishSkipReasonSchema }),
  ),
});
export type PublishAllResult = z.infer<typeof PublishAllResultSchema>;

/**
 * One video lecture's answer to "will this actually play for a student?".
 *
 * `embed` is the question the duration could never answer — see
 * `VideoEmbedStatus`. `missing` is the other half: a video lecture with no
 * `lesson_videos` row at all, which reaches the student as a blank player.
 */
export const CourseVideoCheckRowSchema = z.object({
  lessonId: z.uuid(),
  title: z.string(),
  sectionTitle: z.string(),
  isPublished: z.boolean(),
  /** Absent when the lecture has no video row — nothing to ask YouTube about. */
  externalId: z.string().nullable(),
  embed: VideoEmbedStatusSchema.nullable(),
});
export type CourseVideoCheckRow = z.infer<typeof CourseVideoCheckRowSchema>;

export const CourseVideoCheckSchema = z.object({
  checked: z.number().int().min(0),
  /** Only the ones a student would have trouble with — an all-clear is empty. */
  problems: z.array(CourseVideoCheckRowSchema),
});
export type CourseVideoCheck = z.infer<typeof CourseVideoCheckSchema>;
