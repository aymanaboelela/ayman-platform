import { z } from '@ayman/contracts/zod';

/**
 * «استوديو البوستات» — ready social posts drafted from what already happened
 * on the platform, scheduled on a calendar, and published to the teacher's
 * Facebook Page and Instagram account.
 *
 * ## The shape of the feature
 *
 * The API SCANS (every half hour, or on «دوّر دلوقتي») a fixed set of
 * sources — the honor board, finished exams, the week's certificates, a new
 * course, a new lecture, a news post — and turns each event into one DRAFT
 * keyed by `sourceKey`. The key is UNIQUE in the table, so the same event can
 * never yield two drafts, however many scans see it, and a draft the admin
 * SKIPPED keeps its key: skipping is the answer «not this one», not «ask me
 * again in half an hour».
 *
 * The IMAGE is drawn in the admin's browser, on the same canvas kit as the
 * students' share cards (Arabic shaping — see `canvas-kit.ts`), and uploaded
 * as a JPEG the API re-encodes and stores under a PUBLIC media key, because
 * Instagram downloads the picture from a URL and will not take bytes.
 *
 * ## Student identity
 *
 * Every name in `facts` is already shortened to first name + initial by the
 * API («أحمد م.»), and the only photo a post may carry is the honor-board
 * photo the instructor set on purpose (`honor_photo_key` / a pin's own
 * photo) — never `User.image`. A full name or an avatar never reaches this
 * table, so no edit in the browser can put one on a public page.
 */

export const SOCIAL_POST_KINDS = ['honor', 'results', 'certificates', 'course', 'lecture', 'news'] as const;
export const SocialPostKindSchema = z.enum(SOCIAL_POST_KINDS);
export type SocialPostKind = z.infer<typeof SocialPostKindSchema>;

/**
 * `draft` → the inbox. `scheduled` → on the calendar with a time.
 * `published` → out (by the API, or marked by hand after a manual post).
 * `skipped` → the admin said no; kept so the scan never re-drafts it.
 */
export const SOCIAL_POST_STATUSES = ['draft', 'scheduled', 'published', 'skipped'] as const;
export const SocialPostStatusSchema = z.enum(SOCIAL_POST_STATUSES);
export type SocialPostStatus = z.infer<typeof SocialPostStatusSchema>;

/** Square feed post or a vertical story. */
export const SOCIAL_POST_FORMATS = ['square', 'story'] as const;
export const SocialPostFormatSchema = z.enum(SOCIAL_POST_FORMATS);
export type SocialPostFormat = z.infer<typeof SocialPostFormatSchema>;

export const SOCIAL_IMAGE_SIZE: Record<SocialPostFormat, { w: number; h: number }> = {
  square: { w: 1080, h: 1080 },
  story: { w: 1080, h: 1920 },
};

/** The rendered JPEG the browser uploads; the API re-encodes it anyway. */
export const MAX_SOCIAL_IMAGE_BYTES = 8 * 1024 * 1024;

/** Instagram refuses a caption over 2,200 characters; Facebook takes more. */
export const SOCIAL_CAPTION_MAX = 2200;

/** A student on a post: a SHORT name, and a photo only if one was set for the board. */
export const SocialPersonSchema = z.object({
  name: z.string().min(1).max(60),
  /** Media storage key of the honor-board photo, or null for initials. */
  photoKey: z.string().nullable(),
  score: z.number().nullable(),
  total: z.number().nullable(),
  /** The instructor's place for a pinned honor, 1-based. */
  rank: z.number().int().min(1).nullable(),
});
export type SocialPerson = z.infer<typeof SocialPersonSchema>;

export const SocialFactsSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('honor'),
    /** The Cairo day the round was honoured on, `YYYY-MM-DD`. */
    day: z.string(),
    /** The exam the round was won on, or the reason of a hand-made pin. */
    title: z.string(),
    people: z.array(SocialPersonSchema).min(1).max(5),
  }),
  z.object({
    kind: z.literal('results'),
    examTitle: z.string(),
    courseTitle: z.string(),
    takers: z.number().int().min(1),
    averagePercent: z.number().min(0).max(100),
    passRate: z.number().min(0).max(100),
    fullMarks: z.number().int().min(0),
    top: z.array(SocialPersonSchema).max(3),
  }),
  z.object({
    kind: z.literal('certificates'),
    /** Saturday of the Cairo week, `YYYY-MM-DD`. */
    weekStart: z.string(),
    total: z.number().int().min(1),
    units: z.array(z.object({ title: z.string(), count: z.number().int().min(1) })).max(4),
    people: z.array(SocialPersonSchema).max(6),
  }),
  z.object({
    kind: z.literal('course'),
    title: z.string(),
    subtitle: z.string().nullable(),
    coverKey: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('lecture'),
    title: z.string(),
    courseTitle: z.string(),
    sectionTitle: z.string(),
    coverKey: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('news'),
    title: z.string(),
    excerpt: z.string(),
    coverKey: z.string().nullable(),
  }),
]);
export type SocialFacts = z.infer<typeof SocialFactsSchema>;

const ChannelResultSchema = z.object({
  id: z.string().nullable(),
  permalink: z.string().nullable(),
});

export const SocialPostSchema = z.object({
  id: z.uuid(),
  kind: SocialPostKindSchema,
  status: SocialPostStatusSchema,
  facts: SocialFactsSchema,
  caption: z.string(),
  /** What the templates say for these facts — «رجّع النص الأصلي». */
  suggestedCaption: z.string(),
  /** The platform page the post points at, already absolute. */
  link: z.string(),
  format: SocialPostFormatSchema,
  /** The uploaded picture, public; null until the browser has drawn and sent one. */
  imageUrl: z.string().nullable(),
  /** The format the stored picture was drawn in; a format change makes it stale. */
  imageFormat: SocialPostFormatSchema.nullable(),
  scheduledAt: z.iso.datetime().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  publishMode: z.enum(['api', 'manual']).nullable(),
  facebook: ChannelResultSchema,
  instagram: ChannelResultSchema,
  lastError: z.string().nullable(),
  attempts: z.number().int().min(0),
  createdAt: z.iso.datetime(),
});
export type SocialPost = z.infer<typeof SocialPostSchema>;

export const SocialPostListSchema = z.object({
  /** Drafts, newest first — the inbox. */
  drafts: z.array(SocialPostSchema),
  /** Scheduled and published posts whose time falls in the requested window. */
  calendar: z.array(SocialPostSchema),
  /** Scheduled posts whose time has passed and that are still not out. */
  overdue: z.array(SocialPostSchema),
  counts: z.object({
    draft: z.number().int().min(0),
    scheduled: z.number().int().min(0),
    published: z.number().int().min(0),
    skipped: z.number().int().min(0),
  }),
  /** Whether one-click publishing goes through the Graph API on this stack. */
  connection: z.object({ facebook: z.boolean(), instagram: z.boolean() }),
  lastScanAt: z.iso.datetime().nullable(),
});
export type SocialPostList = z.infer<typeof SocialPostListSchema>;

/** The calendar window. Bounded so a URL cannot ask for every post ever. */
export const SocialPostListQuerySchema = z
  .object({
    from: z.iso.datetime(),
    to: z.iso.datetime(),
  })
  .refine((q) => Date.parse(q.to) > Date.parse(q.from), { message: 'to must be after from' })
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= 45 * 86_400_000, {
    message: 'window too wide',
  });
export type SocialPostListQuery = z.infer<typeof SocialPostListQuerySchema>;

/**
 * One edit from the editor. Every field optional; `status` here may only move
 * between the three the admin chooses — `published` is reached by publishing
 * or by `mark-published`, never by a PATCH.
 */
export const SocialPostPatchSchema = z
  .object({
    caption: z.string().trim().min(1).max(SOCIAL_CAPTION_MAX).optional(),
    format: SocialPostFormatSchema.optional(),
    /** A time to schedule at, or null to take it off the calendar. */
    scheduledAt: z.iso.datetime().nullable().optional(),
    status: z.enum(['draft', 'scheduled', 'skipped']).optional(),
  })
  .strict();
export type SocialPostPatch = z.infer<typeof SocialPostPatchSchema>;

export const SocialMarkPublishedSchema = z
  .object({
    /** Where the admin posted it by hand, if they want it on record. */
    permalink: z.url().max(500).nullable().default(null),
  })
  .strict();
export type SocialMarkPublished = z.infer<typeof SocialMarkPublishedSchema>;

export const SocialScanResultSchema = z.object({ created: z.number().int().min(0) });
export type SocialScanResult = z.infer<typeof SocialScanResultSchema>;

/**
 * The connection as the browser may see it. The token itself never leaves
 * the API: `tokenSet` and the last four characters are all that come back.
 */
export const SocialConnectionSchema = z.object({
  pageId: z.string().nullable(),
  instagramUserId: z.string().nullable(),
  tokenSet: z.boolean(),
  tokenHint: z.string().nullable(),
  /** Appended to every suggested caption, e.g. «#مذاكرة #تفوق». */
  hashtags: z.string(),
  updatedAt: z.iso.datetime().nullable(),
});
export type SocialConnection = z.infer<typeof SocialConnectionSchema>;

const GraphId = z
  .string()
  .trim()
  .regex(/^\d{5,25}$/, 'digits only');

export const SocialConnectionWriteSchema = z
  .object({
    pageId: GraphId.nullable(),
    instagramUserId: GraphId.nullable(),
    /**
     * Absent → keep the stored token. A string → replace it. `null` → forget
     * it. The form never pre-fills this field, so an untouched save keeps the
     * token instead of blanking it.
     */
    accessToken: z.string().trim().min(20).max(1000).nullable().optional(),
    hashtags: z.string().trim().max(300),
  })
  .strict();
export type SocialConnectionWrite = z.infer<typeof SocialConnectionWriteSchema>;

export const SocialConnectionTestSchema = z.object({
  ok: z.boolean(),
  pageName: z.string().nullable(),
  /** The Instagram business account linked to the Page, when Meta reports one. */
  instagramUserId: z.string().nullable(),
  error: z.string().nullable(),
});
export type SocialConnectionTest = z.infer<typeof SocialConnectionTestSchema>;
