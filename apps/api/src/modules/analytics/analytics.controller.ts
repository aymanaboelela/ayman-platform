import { Controller, Get, Header, Param, ParseUUIDPipe, Query, Res, UsePipes } from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import type {
  AnalyticsOverview,
  CourseHeadcountRow,
  LessonAnalyticsDetail,
  LessonAnalyticsRow,
  StudentAnalyticsDetail,
  StudentAnalyticsRow,
} from '@ayman/contracts/admin/analytics';
import type { VideoAnalyticsDetail, VideoAnalyticsList } from '@ayman/contracts/admin/video-analytics';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import {
  LessonAnalyticsQueryDto,
  OverviewQueryDto,
  StudentAnalyticsQueryDto,
  VideoAnalyticsQueryDto,
} from './analytics.dto';
import { CourseHeadcountService } from './course-headcount.service';
import { LessonAnalyticsService } from './lesson-analytics.service';
import { OverviewService } from './overview.service';
import { StudentAnalyticsService } from './student-analytics.service';
import { VideoAnalyticsService } from './video-analytics.service';
import { csvFraction, toCsv } from './csv';
import { toXlsx, XLSX_CONTENT_TYPE, type XlsxColumn } from './xlsx';

/**
 * Every route here is `analytics:read` — the permission the per-quiz item
 * analysis already carries. Nothing on this surface is writable, and nothing
 * on it is student-scoped: it reads across the whole cohort by definition, so
 * there is no "own data" path to widen later.
 *
 * ⚠️ Route order matters. `students/:userId` is registered AFTER `students`,
 * and the export routes sit under their own `export/` segment precisely so a
 * filename can never be mistaken for an id.
 */
@Controller('admin/analytics')
@RequirePermission('analytics:read')
@UsePipes(ZodValidationPipe)
export class AnalyticsController {
  constructor(
    private readonly overview: OverviewService,
    private readonly lessons: LessonAnalyticsService,
    private readonly students: StudentAnalyticsService,
    private readonly headcount: CourseHeadcountService,
    private readonly videos: VideoAnalyticsService,
  ) {}

  @Get('overview')
  getOverview(@Query() query: OverviewQueryDto): Promise<AnalyticsOverview> {
    return this.overview.build(query);
  }

  /**
   * «كام واحد مشترك في كل كورس». Takes no query at all — it is the whole
   * roster, and a `courseId` filter on a per-course roll-up is one row of it.
   *
   * Registered BEFORE `lessons/:lessonId` and `students/:userId` in the file
   * only for readability; `courses` collides with neither, and there is no
   * `:id` route on this controller that could swallow it.
   */
  @Get('courses')
  listCourses(): Promise<CourseHeadcountRow[]> {
    return this.headcount.list();
  }

  @Get('lessons')
  listLessons(@Query() query: LessonAnalyticsQueryDto): Promise<LessonAnalyticsRow[]> {
    return this.lessons.list(query.courseId);
  }

  @Get('lessons/:lessonId')
  lessonDetail(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ): Promise<LessonAnalyticsDetail> {
    return this.lessons.detail(lessonId);
  }

  @Get('students')
  listStudents(
    @Query() query: StudentAnalyticsQueryDto,
  ): Promise<{ rows: StudentAnalyticsRow[]; rowCount: number }> {
    return this.students.list(query);
  }

  @Get('students/:userId')
  studentDetail(@Param('userId') userId: string): Promise<StudentAnalyticsDetail> {
    return this.students.detail(userId);
  }

  /**
   * «إحصائيات الفيديو» — every video with its views, watch time and reach over
   * `?period=`, plus the totals and the daily series across all of them.
   */
  @Get('videos')
  listVideos(@Query() query: VideoAnalyticsQueryDto): Promise<VideoAnalyticsList> {
    return this.videos.list(query.period);
  }

  /**
   * One video, YouTube-Studio style. `:videoKey` is `provider-externalId`
   * (`parseVideoKey`), NOT a uuid — a video is the pair `lesson_videos`
   * stores, possibly on several lessons. A key that cannot name a stored video
   * is a 404 before any query runs.
   */
  @Get('videos/:videoKey')
  videoDetail(
    @Param('videoKey') videoKey: string,
    @Query() query: VideoAnalyticsQueryDto,
  ): Promise<VideoAnalyticsDetail> {
    return this.videos.detail(videoKey, query.period);
  }

  // ── exports ──────────────────────────────────────────────────────────────
  // `text/csv; charset=utf-8` AND the BOM the writer emits. Neither alone is
  // enough: the header is what a browser honours, the BOM is what Excel does.

  @Get('export/lessons.csv')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="lessons.csv"')
  async exportLessons(@Query() query: LessonAnalyticsQueryDto): Promise<string> {
    const rows = await this.lessons.list(query.courseId);
    return toCsv(
      [
        'lesson_id', 'course', 'section', 'position', 'lesson', 'kind',
        'eligible', 'opened', 'open_rate', 'completed', 'completion_rate',
        'avg_completion', 'watch_hours', 'avg_watch_seconds',
        'quiz_attempts', 'quiz_participants', 'quiz_participation_rate',
        'quiz_mean_score', 'quiz_median_score', 'quiz_pass_rate', 'quiz_median_seconds',
      ],
      rows.map((row) => [
        row.lessonId, row.courseTitle, row.sectionTitle, row.position, row.title, row.kind,
        row.eligible, row.opened, csvFraction(row.openRate), row.completed,
        csvFraction(row.completionRate), csvFraction(row.avgCompletion),
        Math.round(row.watchHours * 100) / 100,
        row.avgWatchSeconds === null ? null : Math.round(row.avgWatchSeconds),
        row.quizAttempts, row.quizParticipants, csvFraction(row.quizParticipationRate),
        csvFraction(row.quizMeanScore), csvFraction(row.quizMedianScore),
        csvFraction(row.quizPassRate),
        row.quizMedianDurationSeconds === null ? null : Math.round(row.quizMedianDurationSeconds),
      ]),
    );
  }

  @Get('export/students.csv')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="students.csv"')
  async exportStudents(@Query() query: StudentAnalyticsQueryDto): Promise<string> {
    // The export ignores pagination on purpose — an export of page 1 is the
    // classic "why is my dataset 25 rows" support ticket. Filters DO apply:
    // the file has to match the table the user was looking at.
    const { rows } = await this.students.list({ ...query, page: 1, perPage: 100_000 });
    return toCsv(
      [
        'user_id', 'full_name', 'year', 'governorate', 'enrollments',
        'lessons_opened', 'lessons_completed', 'avg_completion', 'watch_hours',
        'quizzes_taken', 'attempts', 'mean_score', 'best_score', 'pass_rate',
        'median_quiz_seconds', 'last_active_at',
      ],
      rows.map((row) => [
        row.userId, row.fullName, row.year, row.governorateNameAr, row.enrollments,
        row.lessonsOpened, row.lessonsCompleted, csvFraction(row.avgCompletion),
        Math.round(row.watchHours * 100) / 100,
        row.quizzesTaken, row.attempts, csvFraction(row.meanScore), csvFraction(row.bestScore),
        csvFraction(row.passRate),
        row.medianQuizSeconds === null ? null : Math.round(row.medianQuizSeconds),
        row.lastActiveAt,
      ]),
    );
  }

  @Get('export/videos.csv')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="videos.csv"')
  async exportVideos(@Query() query: VideoAnalyticsQueryDto): Promise<string> {
    const { videos } = await this.videos.list(query.period);
    return toCsv(
      [
        'video_key', 'provider', 'title', 'course', 'lessons', 'duration_seconds',
        'views', 'unique_viewers', 'watch_hours', 'avg_view_seconds',
        'avg_percent_watched', 'completed_viewers', 'completion_rate', 'last_viewed_at',
      ],
      videos.map((row) => [
        row.key, row.provider, row.title, row.courseTitle, row.lessonCount, row.durationSeconds,
        row.views, row.uniqueViewers, Math.round((row.watchSeconds / 3600) * 100) / 100,
        row.avgViewSeconds === null ? null : Math.round(row.avgViewSeconds),
        csvFraction(row.avgPercentWatched), row.completedViewers, csvFraction(row.completionRate),
        row.lastViewedAt,
      ]),
    );
  }

  /** The lesson id is a PATH segment, not `?lessonId=`: it is the identity of
   *  the resource being exported, and putting it in the query string makes the
   *  route look optional to every reader (and to the route matcher in the
   *  authorization matrix, which walks static segments). */
  @Get('lessons/:lessonId/roster.csv')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="lesson-roster.csv"')
  async exportRoster(@Param('lessonId', ParseUUIDPipe) lessonId: string): Promise<string> {
    const detail = await this.lessons.detail(lessonId);
    return toCsv(
      [
        'user_id', 'full_name', 'year', 'governorate', 'watched_seconds', 'completion',
        'state', 'open_count', 'last_seen_at', 'attempts', 'best_score', 'last_score',
        'passed', 'quiz_seconds',
      ],
      detail.students.map((row) => [
        row.userId, row.fullName, row.year, row.governorateNameAr, row.watchedSeconds,
        csvFraction(row.completion), row.state, row.openCount, row.lastSeenAt,
        row.attempts, csvFraction(row.bestScore), csvFraction(row.lastScore),
        row.passed === null ? null : row.passed ? 1 : 0,
        row.quizSeconds,
      ]),
    );
  }

  // ── the same four exports as Excel workbooks ─────────────────────────────
  // What the «تنزيل Excel» buttons fetch. Same rows, same filters as the CSV
  // beside each one — only the file format and the Arabic headers differ.
  // `xlsx.ts` says why the CSV alone opened as one column on his machine.

  @Get('export/lessons.xlsx')
  async exportLessonsXlsx(@Query() query: LessonAnalyticsQueryDto, @Res() res: Response): Promise<void> {
    const rows = await this.lessons.list(query.courseId);
    sendXlsx(res, 'lessons', await toXlsx('الدروس', LESSON_COLUMNS, rows));
  }

  @Get('export/students.xlsx')
  async exportStudentsXlsx(@Query() query: StudentAnalyticsQueryDto, @Res() res: Response): Promise<void> {
    // Unpaginated, filtered — the same rule as the CSV above.
    const { rows } = await this.students.list({ ...query, page: 1, perPage: 100_000 });
    sendXlsx(res, 'students', await toXlsx('الطلبة', STUDENT_COLUMNS, rows));
  }

  @Get('export/videos.xlsx')
  async exportVideosXlsx(@Query() query: VideoAnalyticsQueryDto, @Res() res: Response): Promise<void> {
    const { videos } = await this.videos.list(query.period);
    sendXlsx(res, 'videos', await toXlsx('الفيديوهات', VIDEO_COLUMNS, videos));
  }

  @Get('lessons/:lessonId/roster.xlsx')
  async exportRosterXlsx(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Res() res: Response,
  ): Promise<void> {
    const detail = await this.lessons.detail(lessonId);
    sendXlsx(res, 'lesson-roster', await toXlsx('طلبة الدرس', ROSTER_COLUMNS, detail.students));
  }
}

/** `@Res()` bypasses the interceptor chain, so the no-store that
 *  `PrivateCacheInterceptor` gives every admin read is set here by hand: this
 *  file is the whole cohort's names and scores. */
function sendXlsx(res: Response, name: string, buffer: Buffer): void {
  res.set({
    'Content-Type': XLSX_CONTENT_TYPE,
    'Content-Disposition': `attachment; filename="${name}.xlsx"`,
    'Cache-Control': 'private, no-store',
  });
  res.send(buffer);
}

const YEAR_LABEL: Record<number, string> = { 1: 'أولى ثانوي', 2: 'تانية ثانوي', 3: 'تالتة ثانوي' };
const yearLabel = (year: number | null): string | null =>
  year === null ? null : (YEAR_LABEL[year] ?? String(year));

const KIND_LABEL: Record<string, string> = {
  video: 'فيديو',
  quiz: 'امتحان',
  attachment: 'ملف',
  text: 'مقال',
};

/** Same words as `copy.analytics.progressStates`, which the screen shows. */
const STATE_LABEL: Record<string, string> = {
  not_started: 'مافتحوش',
  in_progress: 'لسه بيتفرّج',
  completed: 'خلّصه',
  passed: 'نجح',
  failed: 'رسب',
};

const PROVIDER_LABEL: Record<string, string> = { youtube: 'يوتيوب', upload: 'مرفوع على المنصة' };

const round2 = (n: number): number => Math.round(n * 100) / 100;

const STUDENT_COLUMNS: XlsxColumn<StudentAnalyticsRow>[] = [
  { header: 'الطالب', kind: 'text', width: 30, value: (r) => r.fullName },
  { header: 'الصف', kind: 'text', width: 14, value: (r) => yearLabel(r.year) },
  { header: 'المحافظة', kind: 'text', width: 16, value: (r) => r.governorateNameAr },
  { header: 'كورسات', kind: 'int', value: (r) => r.enrollments },
  { header: 'دروس اتفتحت', kind: 'int', value: (r) => r.lessonsOpened },
  { header: 'دروس خلّصها', kind: 'int', value: (r) => r.lessonsCompleted },
  { header: 'متوسط نسبة المشاهدة', kind: 'percent', width: 16, value: (r) => r.avgCompletion },
  { header: 'ساعات المشاهدة', kind: 'decimal', width: 14, value: (r) => round2(r.watchHours) },
  { header: 'امتحانات حلّها', kind: 'int', width: 13, value: (r) => r.quizzesTaken },
  { header: 'محاولات', kind: 'int', value: (r) => r.attempts },
  { header: 'متوسط درجاته', kind: 'percent', width: 13, value: (r) => r.meanScore },
  { header: 'أعلى درجة', kind: 'percent', value: (r) => r.bestScore },
  { header: 'نسبة النجاح', kind: 'percent', value: (r) => r.passRate },
  { header: 'وسيط زمن الحل', kind: 'duration', width: 14, value: (r) => r.medianQuizSeconds },
  { header: 'آخر نشاط', kind: 'datetime', value: (r) => r.lastActiveAt },
];

const LESSON_COLUMNS: XlsxColumn<LessonAnalyticsRow>[] = [
  { header: 'الكورس', kind: 'text', width: 34, value: (r) => r.courseTitle },
  { header: 'الوحدة', kind: 'text', width: 26, value: (r) => r.sectionTitle },
  { header: 'الترتيب', kind: 'int', width: 8, value: (r) => r.position },
  { header: 'الدرس', kind: 'text', width: 34, value: (r) => r.title },
  { header: 'النوع', kind: 'text', width: 10, value: (r) => KIND_LABEL[r.kind] ?? r.kind },
  { header: 'مشتركين في الكورس', kind: 'int', width: 15, value: (r) => r.eligible },
  { header: 'فتحوه', kind: 'int', value: (r) => r.opened },
  { header: 'نسبة الفتح', kind: 'percent', value: (r) => r.openRate },
  { header: 'خلّصوه', kind: 'int', value: (r) => r.completed },
  { header: 'نسبة اللي خلّصوه', kind: 'percent', width: 14, value: (r) => r.completionRate },
  { header: 'متوسط المشاهدة', kind: 'percent', width: 14, value: (r) => r.avgCompletion },
  { header: 'ساعات المشاهدة', kind: 'decimal', width: 14, value: (r) => round2(r.watchHours) },
  { header: 'متوسط زمن المشاهدة', kind: 'duration', width: 16, value: (r) => r.avgWatchSeconds },
  { header: 'محاولات الامتحان', kind: 'int', width: 14, value: (r) => r.quizAttempts },
  { header: 'حلّوا الامتحان', kind: 'int', width: 13, value: (r) => r.quizParticipants },
  { header: 'نسبة اللي حلّوا', kind: 'percent', width: 13, value: (r) => r.quizParticipationRate },
  { header: 'متوسط الدرجة', kind: 'percent', width: 13, value: (r) => r.quizMeanScore },
  { header: 'وسيط الدرجة', kind: 'percent', width: 13, value: (r) => r.quizMedianScore },
  { header: 'نسبة النجاح', kind: 'percent', value: (r) => r.quizPassRate },
  { header: 'وسيط زمن الحل', kind: 'duration', width: 14, value: (r) => r.quizMedianDurationSeconds },
];

const VIDEO_COLUMNS: XlsxColumn<VideoAnalyticsList['videos'][number]>[] = [
  { header: 'الفيديو', kind: 'text', width: 40, value: (r) => r.title },
  { header: 'الكورس', kind: 'text', width: 30, value: (r) => r.courseTitle },
  { header: 'المصدر', kind: 'text', width: 16, value: (r) => PROVIDER_LABEL[r.provider] ?? r.provider },
  { header: 'عدد الدروس', kind: 'int', value: (r) => r.lessonCount },
  { header: 'مدة الفيديو', kind: 'duration', value: (r) => r.durationSeconds },
  { header: 'المشاهدات', kind: 'int', value: (r) => r.views },
  { header: 'مشاهدين مختلفين', kind: 'int', width: 14, value: (r) => r.uniqueViewers },
  { header: 'ساعات المشاهدة', kind: 'decimal', width: 14, value: (r) => round2(r.watchSeconds / 3600) },
  { header: 'متوسط زمن المشاهدة', kind: 'duration', width: 16, value: (r) => r.avgViewSeconds },
  { header: 'متوسط نسبة المشاهدة', kind: 'percent', width: 16, value: (r) => r.avgPercentWatched },
  { header: 'كمّلوه للآخر', kind: 'int', width: 12, value: (r) => r.completedViewers },
  { header: 'نسبة اللي كمّلوه', kind: 'percent', width: 14, value: (r) => r.completionRate },
  { header: 'آخر مشاهدة', kind: 'datetime', value: (r) => r.lastViewedAt },
];

const ROSTER_COLUMNS: XlsxColumn<LessonAnalyticsDetail['students'][number]>[] = [
  { header: 'الطالب', kind: 'text', width: 30, value: (r) => r.fullName },
  { header: 'الصف', kind: 'text', width: 14, value: (r) => yearLabel(r.year) },
  { header: 'المحافظة', kind: 'text', width: 16, value: (r) => r.governorateNameAr },
  { header: 'الحالة', kind: 'text', width: 14, value: (r) => STATE_LABEL[r.state] ?? r.state },
  { header: 'مشاهدة', kind: 'duration', value: (r) => r.watchedSeconds },
  { header: 'نسبة المشاهدة', kind: 'percent', width: 13, value: (r) => r.completion },
  { header: 'مرات الفتح', kind: 'int', value: (r) => r.openCount },
  { header: 'آخر مرة', kind: 'datetime', value: (r) => r.lastSeenAt },
  { header: 'محاولات', kind: 'int', value: (r) => r.attempts },
  { header: 'أعلى درجة', kind: 'percent', value: (r) => r.bestScore },
  { header: 'آخر درجة', kind: 'percent', value: (r) => r.lastScore },
  { header: 'نجح؟', kind: 'text', width: 8, value: (r) => (r.passed === null ? null : r.passed ? 'نجح' : 'رسب') },
  { header: 'زمن الحل', kind: 'duration', value: (r) => r.quizSeconds },
];
