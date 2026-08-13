import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { LessonAnalyticsService } from './lesson-analytics.service';
import { OverviewService } from './overview.service';
import { StudentAnalyticsService } from './student-analytics.service';

/**
 * The cohort-wide analytics surface. Distinct from `QuizModule`'s own
 * `AnalyticsService`, which answers ITEM analysis for one quiz (facility,
 * discrimination, distractors) — that stays where the questions live. This
 * module reads across lessons, students and time, and owns no writes at all.
 */
@Module({
  controllers: [AnalyticsController],
  providers: [OverviewService, LessonAnalyticsService, StudentAnalyticsService],
})
export class InsightsModule {}
