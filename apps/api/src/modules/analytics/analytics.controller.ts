import { Controller, Get, Header, Param, ParseUUIDPipe, Query, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type {
  AnalyticsOverview,
  LessonAnalyticsDetail,
  LessonAnalyticsRow,
  StudentAnalyticsDetail,
  StudentAnalyticsRow,
} from '@ayman/contracts/admin/analytics';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import {
  LessonAnalyticsQueryDto,
  OverviewQueryDto,
  StudentAnalyticsQueryDto,
} from './analytics.dto';
import { LessonAnalyticsService } from './lesson-analytics.service';
import { OverviewService } from './overview.service';
import { StudentAnalyticsService } from './student-analytics.service';
import { csvFraction, toCsv } from './csv';

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
  ) {}

  @Get('overview')
  getOverview(@Query() query: OverviewQueryDto): Promise<AnalyticsOverview> {
    return this.overview.build(query);
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
}
