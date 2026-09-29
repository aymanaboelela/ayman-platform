import { z } from '@ayman/contracts/zod';
import { UPLOAD_ID_RE, VideoProviderSchema, YOUTUBE_ID_RE, type VideoProvider } from '@ayman/contracts/video';

/**
 * «إحصائيات الفيديو» — views, watch time and retention, per VIDEO.
 *
 * The lesson analytics (`./analytics`) answer «مين من المشتركين فتح الدرس».
 * This answers the question the owner put in YouTube Studio's words: «الفيديو
 * اتشاف قد إيه، كام مشاهدة، وإجمالي» — how much a video is WATCHED, over a
 * period, regardless of who could have watched it. Same tables underneath
 * (`lesson_view_sessions`, `lesson_progress`), a different unit on top.
 *
 * ## A video is not a lesson
 *
 * One uploaded lecture can sit on several lessons («اختار فيديو متروفع قبل
 * كده»), and the same YouTube id can be pasted into two courses. So the unit
 * here is the pair `(provider, externalId)` — what `lesson_videos` stores — and
 * every figure is summed over every lesson carrying it. A video's page lists
 * those lessons, with their own share of the views.
 *
 * YouTube lectures are videos too. Every number comes from OUR heartbeat
 * tables, never from the host, so a lecture played through YouTube's embed is
 * counted exactly like one played from our own copy.
 *
 * ## What a «view» is
 *
 * One SITTING (`lesson_view_sessions` row — heartbeats merged while they keep
 * arriving) that credited at least one second. A sitting that credited nothing
 * is the page opening and the video never playing; YouTube does not count
 * that as a view either, and counting it here would make «متوسط مدة المشاهدة»
 * read shorter than any student actually watched.
 *
 * Only students count — the same `role = 'student'` + profile population every
 * analytics screen uses. The instructor checking his own upload is not a view.
 */

// ── the period ─────────────────────────────────────────────────────────────

/** YouTube Studio's own windows. A closed list, so `?period=` can never ask for
 *  an arbitrary range — the same reason `OverviewQuerySchema.days` is one. */
export const VIDEO_PERIODS = ['7d', '28d', '90d', 'all'] as const;
export type VideoPeriod = (typeof VIDEO_PERIODS)[number];
export const VideoPeriodSchema = z.enum(VIDEO_PERIODS);
export const DEFAULT_VIDEO_PERIOD: VideoPeriod = '28d';

/** Calendar days in the window, TODAY INCLUDED; `null` is all time. */
export const VIDEO_PERIOD_DAYS: Record<VideoPeriod, number | null> = {
  '7d': 7,
  '28d': 28,
  '90d': 90,
  all: null,
};

/** The all-time chart stops here — a daily series is unreadable past a year,
 *  and the headline numbers above it are still all-time. 365, not 366: the
 *  axis names a day by day-and-month, and a 366th bar would repeat today's. */
export const VIDEO_SERIES_MAX_DAYS = 365;

// ── the key ────────────────────────────────────────────────────────────────

/**
 * `upload-<32 hex>` / `youtube-<11 chars>` — the video's identity in a URL.
 *
 * `-` and not `.` or `:`: a dot in the last path segment reads as a file
 * extension to every matcher that skips static files (the proxy's among them),
 * and a colon is percent-encoded by half the tools that touch a URL. Parsing
 * splits at the FIRST dash, which is unambiguous because no provider name
 * contains one — a YouTube id may, and that is fine after the first.
 */
export function videoKeyOf(provider: VideoProvider, externalId: string): string {
  return `${provider}-${externalId}`;
}

export function parseVideoKey(key: string): { provider: VideoProvider; externalId: string } | null {
  const at = key.indexOf('-');
  if (at <= 0) return null;
  const provider = VideoProviderSchema.safeParse(key.slice(0, at));
  if (!provider.success) return null;
  const externalId = key.slice(at + 1);
  return EXTERNAL_ID_SHAPE[provider.data].test(externalId) ? { provider: provider.data, externalId } : null;
}

/**
 * The id shape per provider — the same CASE the `lesson_videos_external_id_shape`
 * CHECK runs, so a key that fails it names a video that cannot exist and is a
 * 404 without a query. The CHECK leaves the other five providers open (nothing
 * writes them yet); this only insists they stay URL-safe.
 */
const OTHER_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const EXTERNAL_ID_SHAPE: Record<VideoProvider, RegExp> = {
  youtube: YOUTUBE_ID_RE,
  upload: UPLOAD_ID_RE,
  vimeo: OTHER_ID_RE,
  bunny: OTHER_ID_RE,
  vdocipher: OTHER_ID_RE,
  ink: OTHER_ID_RE,
  gumlet: OTHER_ID_RE,
};

// ── retention ──────────────────────────────────────────────────────────────

/**
 * The retention curve has `RETENTION_STEPS + 1` points: 0%, 5%, … 100% of the
 * video. Point k is the share of viewers who REACHED k·5% of it.
 *
 * Approximate, and the screen says so. YouTube knows every second each viewer
 * played; we store, per student and lesson, the furthest position they ever
 * reached (`max_position_seconds`). So the curve is «كام واحد وصل لحد هنا» —
 * a student who skipped ahead counts as having reached the end, and one who
 * rewatched the middle five times counts once.
 */
export const RETENTION_STEPS = 20;

// ── wire shapes ────────────────────────────────────────────────────────────

const fraction = z.number().min(0).max(1);
const count = z.number().int().min(0);

export const VideoStatsRowSchema = z.object({
  key: z.string(),
  provider: VideoProviderSchema,
  externalId: z.string(),
  /** The lesson it is best known by — the first published one, by course then
   *  position. A video has no title of its own. */
  title: z.string(),
  courseTitle: z.string(),
  /** How many lessons carry it. `> 1` is the reused-upload case. */
  lessonCount: z.number().int().min(1),
  /** `null` while unknown (an upload still processing writes 0). */
  durationSeconds: z.number().int().positive().nullable(),
  /** The file the instructor uploaded, when there was one. */
  sourceName: z.string().nullable(),

  views: count,
  uniqueViewers: count,
  watchSeconds: z.number().min(0),
  /** Watch time per view. `null` with no views — never «٠». */
  avgViewSeconds: z.number().min(0).nullable(),
  /** Mean over viewers of the furthest point each reached, as a fraction of the
   *  video. Lifetime per viewer — see `RETENTION_STEPS`. */
  avgPercentWatched: fraction.nullable(),
  /** Viewers whose lesson is marked complete — the lessons table's «خلّصوه». */
  completedViewers: count,
  completionRate: fraction.nullable(),
  lastViewedAt: z.string().nullable(),
});
export type VideoStatsRow = z.infer<typeof VideoStatsRowSchema>;

export const VideoDailyPointSchema = z.object({
  /** `YYYY-MM-DD`, Africa/Cairo. Every day of the window is present, zeros
   *  included — see `DailyPointSchema` for why a hole is worse than a zero. */
  date: z.string(),
  views: count,
  viewers: count,
  watchMinutes: z.number().min(0),
});
export type VideoDailyPoint = z.infer<typeof VideoDailyPointSchema>;

export const VideoTotalsSchema = z.object({
  /** Every video on a lesson, watched or not. */
  videos: count,
  /** …of which this many had at least one view in the period. */
  watchedVideos: count,
  views: count,
  /** DISTINCT students across all videos — not the sum of each video's, which
   *  counts a student once per video they opened. */
  uniqueViewers: count,
  watchSeconds: z.number().min(0),
  avgViewSeconds: z.number().min(0).nullable(),
});
export type VideoTotals = z.infer<typeof VideoTotalsSchema>;

export const VideoAnalyticsListSchema = z.object({
  period: VideoPeriodSchema,
  /** Start of the window (a Cairo midnight, as an ISO instant); `null` = all time. */
  from: z.string().nullable(),
  totals: VideoTotalsSchema,
  daily: z.array(VideoDailyPointSchema),
  /** Most viewed first. */
  videos: z.array(VideoStatsRowSchema),
});
export type VideoAnalyticsList = z.infer<typeof VideoAnalyticsListSchema>;

/** One lesson a video sits on, and its own share of the period's views. */
export const VideoLessonStatsSchema = z.object({
  lessonId: z.string(),
  title: z.string(),
  courseId: z.string(),
  courseTitle: z.string(),
  sectionTitle: z.string(),
  isPublished: z.boolean(),
  durationSeconds: z.number().int().positive().nullable(),
  views: count,
  uniqueViewers: count,
  watchSeconds: z.number().min(0),
});
export type VideoLessonStats = z.infer<typeof VideoLessonStatsSchema>;

export const VideoViewerRowSchema = z.object({
  userId: z.string(),
  fullName: z.string(),
  year: z.number().int().nullable(),
  governorateNameAr: z.string().nullable(),
  /** Sittings in the period. */
  views: count,
  watchSeconds: count,
  /** Furthest point reached, lifetime. `null` when the length is unknown. */
  percentWatched: fraction.nullable(),
  completed: z.boolean(),
  lastViewedAt: z.string(),
});
export type VideoViewerRow = z.infer<typeof VideoViewerRowSchema>;

/** How many viewers the detail lists. The count above the table is the full
 *  one (`summary.uniqueViewers`); this is only how many rows ride along. */
export const VIDEO_VIEWERS_LIMIT = 200;

export const VideoAnalyticsDetailSchema = z.object({
  period: VideoPeriodSchema,
  from: z.string().nullable(),
  summary: VideoStatsRowSchema,
  lessons: z.array(VideoLessonStatsSchema),
  daily: z.array(VideoDailyPointSchema),
  /** `RETENTION_STEPS + 1` shares, or `null` when no viewer has a measurable
   *  position (the video's length is unknown). */
  retention: z.array(fraction).length(RETENTION_STEPS + 1).nullable(),
  /** Views by the Cairo hour the sitting STARTED, 0..23. */
  byHour: z.array(count).length(24),
  /** Most watch time first, capped at `VIDEO_VIEWERS_LIMIT`. */
  viewers: z.array(VideoViewerRowSchema),
});
export type VideoAnalyticsDetail = z.infer<typeof VideoAnalyticsDetailSchema>;
