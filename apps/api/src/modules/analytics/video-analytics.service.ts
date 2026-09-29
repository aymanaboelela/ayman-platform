import { Injectable, NotFoundException } from '@nestjs/common';
import {
  RETENTION_STEPS,
  VIDEO_VIEWERS_LIMIT,
  parseVideoKey,
  videoKeyOf,
  type VideoAnalyticsDetail,
  type VideoAnalyticsList,
  type VideoLessonStats,
  type VideoPeriod,
  type VideoStatsRow,
} from '@ayman/contracts/admin/video-analytics';
import { VideoProviderSchema } from '@ayman/contracts/video';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { cairoDate, cairoHour, clampFraction, rate, studentJoins } from './analytics-shared';
import {
  dailySeries,
  hourSeries,
  perView,
  periodStart,
  retentionCurve,
  seriesStart,
} from './video-analytics-math';

/** One sitting's owner, restricted to the population every analytics screen
 *  counts. `e` is the enrollment; `studentJoins` owns `su`/`sp`. */
const VIEWER_JOINS = Prisma.sql`
          JOIN "app"."enrollments" e ON e."id" = vs."enrollment_id"
          ${studentJoins('e."user_id"')}`;

/**
 * The WHERE every «view» satisfies — `watched_seconds > 0` is the definition
 * of a view (see the contract file). In one place because the list and the
 * detail must count the same sittings, or a video's page stops agreeing with
 * its row in the table one click back.
 */
function viewFilter(since: Date | null): Prisma.Sql {
  return since === null
    ? Prisma.sql`vs."watched_seconds" > 0`
    : Prisma.sql`vs."watched_seconds" > 0 AND vs."started_at" >= ${since}`;
}

/**
 * How far one progress row got, as a fraction of ITS OWN lesson's video.
 * Per lesson rather than per video, because a trim makes the same upload a
 * different length on two lessons — and the heartbeat caps
 * `max_position_seconds` at the length the student was actually served.
 * `NULLIF` turns an unknown length (an upload still processing writes 0) into
 * a NULL that every aggregate skips, rather than a division error.
 */
const REACH = Prisma.sql`LEAST(lp."max_position_seconds"::float / NULLIF(lv."duration_seconds", 0), 1)`;

/**
 * The same thing as a retention STEP, 0..RETENTION_STEPS, in integer
 * arithmetic — `7 × 20 / 20` is exactly 7, where the float route can land on
 * 6.999… and floor a viewer into the step below the one they reached.
 */
const REACH_STEP = Prisma.sql`(LEAST(lp."max_position_seconds", lv."duration_seconds") * ${RETENTION_STEPS}::int) / NULLIF(lv."duration_seconds", 0)`;

/** «خلّصه» — the lessons table's `completed`, so the two screens agree. */
const DONE = Prisma.sql`lp."state" IN ('completed', 'passed')`;

interface CatalogRow {
  provider: string;
  external_id: string;
  title: string;
  course_title: string;
  duration_seconds: number;
  source_name: string | null;
  lesson_count: number;
}

/** The columns every aggregate row carries, whatever it is grouped by. */
interface Totals {
  views: number;
  viewers: number;
  watch_seconds: number;
  last_viewed_at: Date | null;
  first_viewed_at: Date | null;
}

interface ListRow extends Totals {
  grain: 'video' | 'day' | 'total';
  provider: string | null;
  external_id: string | null;
  day: string | null;
  avg_reach: number | null;
  completed: number | null;
}

interface DetailRow extends Totals {
  grain: 'lesson' | 'day' | 'hour' | 'step' | 'total';
  /** The lesson id, the `YYYY-MM-DD`, the hour, or the retention step. */
  bucket: string | null;
  /** `step` rows only: viewers with a known length, their summed reach, and
   *  how many of them finished. */
  measured: number | null;
  reach_sum: number | null;
  completed: number | null;
}

const EMPTY: Totals = { views: 0, viewers: 0, watch_seconds: 0, last_viewed_at: null, first_viewed_at: null };

/**
 * «إحصائيات الفيديو» — YouTube Studio's numbers, from our own heartbeat tables.
 *
 * ## Aggregates only, one scan, and no `count(DISTINCT …)`
 *
 * `lesson_view_sessions` is one row per sitting for every student on every
 * lesson — the biggest table this module reads, and nothing here pulls its
 * rows into Node.
 *
 * The first version asked for the headline, the per-video split and the daily
 * bars in one `GROUPING SETS` with `count(DISTINCT user_id)`. Correct, and
 * measured at ~15 s over 90 days of a synthetic million-sitting table: a
 * DISTINCT aggregate cannot be hashed, so Postgres SORTED the whole window
 * once per grouping set, spilling to disk at the default `work_mem`.
 *
 * So each statement below first collapses the window to one row per
 * (video, student, day) — a plain hash aggregate, one pass over the sittings —
 * and then every figure is a SUM or a COUNT(*) over that: «unique viewers» of a
 * video is the number of (video, student) groups, which needs no DISTINCT.
 * The per-video rows, the day bars, the headline and — on a video's page — the
 * retention histogram all come out of that one scan, which also means they
 * cannot disagree about which sittings they counted.
 *
 * The list reads the whole window: there is no index on `started_at`, and a
 * 28-day window on a live cohort is a large slice of the table anyway (the
 * overview's daily series makes the same scan). One video's page is narrowed
 * first by `lesson_id`, which is indexed.
 *
 * ## Known limit: a sitting is on a LESSON, not a video
 *
 * `lesson_view_sessions` records the lesson, and a lesson's video can be
 * swapped. So when an instructor replaces a lecture's YouTube link with an
 * upload, the sittings from before the swap are credited to the upload. No
 * column records which video was playing; making that exact would need one on
 * the sitting, written by the heartbeat, from the swap onward.
 */
@Injectable()
export class VideoAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(period: VideoPeriod): Promise<VideoAnalyticsList> {
    const now = new Date();
    const since = periodStart(period, now);

    const [catalog, rows] = await Promise.all([
      /*
       * Every video on a lesson, watched or not — named after the first
       * lesson it was put on, published ones first so a draft copy of a
       * lecture never lends it its working title. «First» by `created_at` and
       * not by course title: title order is the database's COLLATION, which is
       * not the same on a Mac as on the server, and the detail page (which
       * sorts the same placements in JS) has to pick the same name.
       */
      this.prisma.$queryRaw<CatalogRow[]>(Prisma.sql`
        SELECT DISTINCT ON (lv."provider", lv."external_id")
               lv."provider"::text AS provider, lv."external_id",
               l."title", c."title" AS course_title,
               lv."duration_seconds", lv."source_name",
               count(*) OVER (PARTITION BY lv."provider", lv."external_id")::int AS lesson_count
        FROM "app"."lesson_videos" lv
        JOIN "app"."lessons" l ON l."id" = lv."lesson_id"
        JOIN "app"."courses" c ON c."id" = l."course_id"
        ORDER BY lv."provider", lv."external_id", l."is_published" DESC, lv."created_at", lv."lesson_id"
      `),
      this.prisma.$queryRaw<ListRow[]>(Prisma.sql`
        WITH cell AS (
          -- One row per (video, student, Cairo day): the only pass over the
          -- sittings. Everything below is arithmetic on these.
          SELECT lv."provider", lv."external_id", e."user_id",
                 ${cairoDate('vs."started_at"')} AS day,
                 count(*) AS views,
                 sum(vs."watched_seconds") AS watch,
                 max(vs."last_seen_at") AS last_at,
                 min(vs."started_at") AS first_at
          FROM "app"."lesson_view_sessions" vs
          JOIN "app"."lesson_videos" lv ON lv."lesson_id" = vs."lesson_id"
          ${VIEWER_JOINS}
          WHERE ${viewFilter(since)}
          GROUP BY 1, 2, 3, 4
        ),
        viewer AS (
          SELECT "provider", "external_id", "user_id",
                 sum(views) AS views, sum(watch) AS watch, max(last_at) AS last_at
          FROM cell
          GROUP BY 1, 2, 3
        ),
        -- How far each (video, student) got: the furthest point on ANY lesson
        -- carrying the video, so a student who met it on two lessons is one
        -- viewer with one reach, not two.
        reach AS (
          SELECT w."provider", w."external_id", w."user_id",
                 max(${REACH}) AS reach, bool_or(${DONE}) AS done
          FROM viewer w
          JOIN "app"."lesson_videos" lv
            ON lv."provider" = w."provider" AND lv."external_id" = w."external_id"
          JOIN "app"."enrollments" pe ON pe."user_id" = w."user_id"
          JOIN "app"."lesson_progress" lp
            ON lp."enrollment_id" = pe."id" AND lp."lesson_id" = lv."lesson_id"
          GROUP BY 1, 2, 3
        ),
        per_day AS (
          SELECT "day", count(*) AS viewers, sum(views) AS views, sum(watch) AS watch
          FROM (SELECT "day", "user_id", sum(views) AS views, sum(watch) AS watch FROM cell GROUP BY 1, 2) d
          GROUP BY 1
        ),
        per_student AS (
          SELECT "user_id", sum(views) AS views, sum(watch) AS watch,
                 max(last_at) AS last_at, min(first_at) AS first_at
          FROM cell
          GROUP BY 1
        )
        SELECT 'video' AS grain, w."provider"::text AS provider, w."external_id", NULL::text AS day,
               sum(w.views)::int AS views, count(*)::int AS viewers, sum(w.watch)::float AS watch_seconds,
               max(w.last_at) AS last_viewed_at, NULL::timestamp AS first_viewed_at,
               avg(r.reach)::float AS avg_reach, (count(*) FILTER (WHERE r.done))::int AS completed
        FROM viewer w
        LEFT JOIN reach r USING ("provider", "external_id", "user_id")
        GROUP BY w."provider", w."external_id"
        UNION ALL
        SELECT 'day', NULL, NULL, to_char("day", 'YYYY-MM-DD'),
               views::int, viewers::int, watch::float, NULL, NULL, NULL, NULL
        FROM per_day
        UNION ALL
        -- Always exactly one row, even over an empty window: an aggregate
        -- with no GROUP BY answers once. count(*) here is DISTINCT students.
        SELECT 'total', NULL, NULL, NULL,
               COALESCE(sum(views), 0)::int, count(*)::int, COALESCE(sum(watch), 0)::float,
               max(last_at), min(first_at), NULL, NULL
        FROM per_student
      `),
    ]);

    const byVideo = new Map<string, ListRow>();
    const days: ListRow[] = [];
    let total: Totals = EMPTY;
    for (const row of rows) {
      if (row.grain === 'video') byVideo.set(`${row.provider}\u0000${row.external_id}`, row);
      else if (row.grain === 'day') days.push(row);
      else total = row;
    }

    const videos = catalog
      .map((video) => {
        const row = byVideo.get(`${video.provider}\u0000${video.external_id}`);
        return toStatsRow(video, row ?? EMPTY, row?.avg_reach ?? null, row?.completed ?? 0);
      })
      // Most viewed first, then most watched: the table opens on the answer
      // to «أكتر فيديو اتشاف», and the client re-sorts from there.
      .sort((a, b) => b.views - a.views || b.watchSeconds - a.watchSeconds);

    return {
      period,
      from: since?.toISOString() ?? null,
      totals: {
        videos: videos.length,
        watchedVideos: byVideo.size,
        views: total.views,
        uniqueViewers: total.viewers,
        watchSeconds: total.watch_seconds,
        avgViewSeconds: perView(total.watch_seconds, total.views),
      },
      daily: dailySeries(
        seriesStart(period, now, total.first_viewed_at),
        now,
        days.map((row) => ({
          day: row.day ?? '',
          views: row.views,
          viewers: row.viewers,
          watchSeconds: row.watch_seconds,
        })),
      ),
      videos,
    };
  }

  async detail(key: string, period: VideoPeriod): Promise<VideoAnalyticsDetail> {
    const parsed = parseVideoKey(key);
    if (parsed === null) throw new NotFoundException();

    const placements = await this.prisma.lessonVideo.findMany({
      where: { provider: parsed.provider, externalId: parsed.externalId },
      select: {
        lessonId: true,
        durationSeconds: true,
        sourceName: true,
        createdAt: true,
        lesson: {
          select: {
            title: true,
            isPublished: true,
            section: { select: { title: true } },
            course: { select: { id: true, title: true } },
          },
        },
      },
    });
    if (placements.length === 0) throw new NotFoundException();

    // The catalog query's ORDER BY, in JS — published first, then the order
    // the video was put on them. The head of this list is what names the
    // video, and it must be the name the list printed one click ago.
    placements.sort(
      (a, b) =>
        Number(b.lesson.isPublished) - Number(a.lesson.isPublished) ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        (a.lessonId < b.lessonId ? -1 : a.lessonId > b.lessonId ? 1 : 0),
    );
    const lessonIds = placements.map((placement) => placement.lessonId);
    const now = new Date();
    const since = periodStart(period, now);
    /** The sittings on this video's lessons that count as views. */
    const sittings = Prisma.sql`
          FROM "app"."lesson_view_sessions" vs
          ${VIEWER_JOINS}
          WHERE vs."lesson_id" = ANY(${lessonIds}::uuid[]) AND ${viewFilter(since)}`;

    const [rows, viewerRows] = await Promise.all([
      this.prisma.$queryRaw<DetailRow[]>(Prisma.sql`
        WITH cell AS (
          -- One row per (lesson, student, Cairo day, Cairo hour) — the one
          -- pass over this video's sittings.
          SELECT vs."lesson_id", e."user_id",
                 ${cairoDate('vs."started_at"')} AS day,
                 ${cairoHour('vs."started_at"')} AS hour,
                 count(*) AS views,
                 sum(vs."watched_seconds") AS watch,
                 max(vs."last_seen_at") AS last_at,
                 min(vs."started_at") AS first_at
          ${sittings}
          GROUP BY 1, 2, 3, 4
        ),
        per_student AS (
          SELECT "user_id", sum(views) AS views, sum(watch) AS watch,
                 max(last_at) AS last_at, min(first_at) AS first_at
          FROM cell
          GROUP BY 1
        ),
        -- Each viewer's furthest step and whether they finished — over the
        -- SAME students per_student counted, so the curve's denominator is
        -- the viewer count printed above it.
        reach AS (
          SELECT ps."user_id",
                 max(${REACH_STEP}) AS step, max(${REACH}) AS reach, bool_or(${DONE}) AS done
          FROM per_student ps
          JOIN "app"."enrollments" pe ON pe."user_id" = ps."user_id"
          JOIN "app"."lesson_progress" lp
            ON lp."enrollment_id" = pe."id" AND lp."lesson_id" = ANY(${lessonIds}::uuid[])
          JOIN "app"."lesson_videos" lv ON lv."lesson_id" = lp."lesson_id"
          GROUP BY 1
        )
        SELECT 'lesson' AS grain, "lesson_id"::text AS bucket,
               sum(views)::int AS views, count(*)::int AS viewers, sum(watch)::float AS watch_seconds,
               NULL::timestamp AS last_viewed_at, NULL::timestamp AS first_viewed_at,
               NULL::int AS measured, NULL::float AS reach_sum, NULL::int AS completed
        FROM (SELECT "lesson_id", "user_id", sum(views) AS views, sum(watch) AS watch FROM cell GROUP BY 1, 2) l
        GROUP BY "lesson_id"
        UNION ALL
        SELECT 'day', to_char("day", 'YYYY-MM-DD'), sum(views)::int, count(*)::int, sum(watch)::float,
               NULL, NULL, NULL, NULL, NULL
        FROM (SELECT "day", "user_id", sum(views) AS views, sum(watch) AS watch FROM cell GROUP BY 1, 2) d
        GROUP BY "day"
        UNION ALL
        SELECT 'hour', "hour"::text, sum(views)::int, 0, 0, NULL, NULL, NULL, NULL, NULL
        FROM cell
        GROUP BY "hour"
        UNION ALL
        SELECT 'step', step::text, 0, count(*)::int, 0, NULL, NULL,
               count(reach)::int, COALESCE(sum(reach), 0)::float, (count(*) FILTER (WHERE done))::int
        FROM reach
        GROUP BY step
        UNION ALL
        SELECT 'total', NULL, COALESCE(sum(views), 0)::int, count(*)::int, COALESCE(sum(watch), 0)::float,
               max(last_at), min(first_at), NULL, NULL, NULL
        FROM per_student
      `),
      /*
       * The viewers themselves, most watch time first. The LIMIT is inside
       * the CTE so the profile join and the per-student reach lookup run for
       * the rows that are shown, not for every viewer the video ever had.
       */
      this.prisma.$queryRaw<
        {
          user_id: string;
          views: number;
          watch_seconds: number;
          last_viewed_at: Date;
          full_name: string;
          year: number | null;
          governorate: string | null;
          reach: number | null;
          done: boolean;
        }[]
      >(Prisma.sql`
        WITH per_user AS (
          SELECT e."user_id",
                 count(*)::int AS views,
                 sum(vs."watched_seconds")::int AS watch_seconds,
                 max(vs."last_seen_at") AS last_viewed_at
          ${sittings}
          GROUP BY e."user_id"
          ORDER BY watch_seconds DESC, last_viewed_at DESC
          LIMIT ${VIDEO_VIEWERS_LIMIT}
        )
        SELECT pu."user_id", pu."views", pu."watch_seconds", pu."last_viewed_at",
               pr."full_name", pr."year"::int AS year, g."name_ar" AS governorate,
               r.reach, COALESCE(r.done, FALSE) AS done
        FROM per_user pu
        JOIN "app"."student_profiles" pr ON pr."user_id" = pu."user_id"
        LEFT JOIN "app"."governorates" g ON g."code" = pr."governorate_code"
        LEFT JOIN LATERAL (
          SELECT max(${REACH}) AS reach, bool_or(${DONE}) AS done
          FROM "app"."enrollments" pe
          JOIN "app"."lesson_progress" lp
            ON lp."enrollment_id" = pe."id" AND lp."lesson_id" = ANY(${lessonIds}::uuid[])
          JOIN "app"."lesson_videos" lv ON lv."lesson_id" = lp."lesson_id"
          WHERE pe."user_id" = pu."user_id"
        ) r ON TRUE
        ORDER BY pu."watch_seconds" DESC, pu."last_viewed_at" DESC
      `),
    ]);

    const byLesson = new Map<string, DetailRow>();
    const days: DetailRow[] = [];
    const hours: { hour: number; n: number }[] = [];
    const steps: DetailRow[] = [];
    let total: Totals = EMPTY;
    for (const row of rows) {
      if (row.grain === 'lesson' && row.bucket !== null) byLesson.set(row.bucket, row);
      else if (row.grain === 'day') days.push(row);
      else if (row.grain === 'hour') hours.push({ hour: Number(row.bucket), n: row.views });
      else if (row.grain === 'step') steps.push(row);
      else if (row.grain === 'total') total = row;
    }

    const measured = steps.reduce((sum, row) => sum + (row.measured ?? 0), 0);
    const reachSum = steps.reduce((sum, row) => sum + (row.reach_sum ?? 0), 0);
    const completed = steps.reduce((sum, row) => sum + (row.completed ?? 0), 0);

    const head = placements[0]!;
    const summary = toStatsRow(
      {
        provider: parsed.provider,
        external_id: parsed.externalId,
        title: head.lesson.title,
        course_title: head.lesson.course.title,
        duration_seconds: head.durationSeconds,
        source_name: head.sourceName,
        lesson_count: placements.length,
      },
      total,
      measured > 0 ? reachSum / measured : null,
      completed,
    );

    const lessons: VideoLessonStats[] = placements.map((placement) => {
      const row = byLesson.get(placement.lessonId) ?? EMPTY;
      return {
        lessonId: placement.lessonId,
        title: placement.lesson.title,
        courseId: placement.lesson.course.id,
        courseTitle: placement.lesson.course.title,
        sectionTitle: placement.lesson.section.title,
        isPublished: placement.lesson.isPublished,
        durationSeconds: placement.durationSeconds > 0 ? placement.durationSeconds : null,
        views: row.views,
        uniqueViewers: row.viewers,
        watchSeconds: row.watch_seconds,
      };
    });

    return {
      period,
      from: since?.toISOString() ?? null,
      summary,
      lessons,
      daily: dailySeries(
        seriesStart(period, now, total.first_viewed_at),
        now,
        days.map((row) => ({
          day: row.bucket ?? '',
          views: row.views,
          viewers: row.viewers,
          watchSeconds: row.watch_seconds,
        })),
      ),
      // A NULL step is a viewer whose video length is unknown — in the
      // headline's viewer count, but with no point on a curve to put them at.
      retention: retentionCurve(
        steps
          .filter((row) => row.bucket !== null)
          .map((row) => ({ step: Number(row.bucket), n: row.viewers })),
      ),
      byHour: hourSeries(hours),
      viewers: viewerRows.map((row) => ({
        userId: row.user_id,
        fullName: row.full_name,
        year: row.year,
        governorateNameAr: row.governorate,
        views: row.views,
        watchSeconds: row.watch_seconds,
        percentWatched: clampFraction(row.reach),
        completed: row.done,
        lastViewedAt: row.last_viewed_at.toISOString(),
      })),
    };
  }
}

/** The single translator from SQL rows to the wire row — list and detail both
 *  go through it, so «متوسط المشاهدة» cannot be computed two ways. */
function toStatsRow(
  video: CatalogRow,
  views: Totals,
  avgReach: number | null,
  completed: number,
): VideoStatsRow {
  const provider = VideoProviderSchema.parse(video.provider);
  // Both counts come from the same scan, so this bound never binds on a
  // consistent read — it is a guard, not a correction.
  const finished = Math.min(completed, views.viewers);
  return {
    key: videoKeyOf(provider, video.external_id),
    provider,
    externalId: video.external_id,
    title: video.title,
    courseTitle: video.course_title,
    lessonCount: video.lesson_count,
    durationSeconds: video.duration_seconds > 0 ? video.duration_seconds : null,
    sourceName: video.source_name,
    views: views.views,
    uniqueViewers: views.viewers,
    watchSeconds: views.watch_seconds,
    avgViewSeconds: perView(views.watch_seconds, views.views),
    avgPercentWatched: clampFraction(avgReach),
    completedViewers: finished,
    completionRate: rate(finished, views.viewers),
    lastViewedAt: views.last_viewed_at?.toISOString() ?? null,
  };
}
