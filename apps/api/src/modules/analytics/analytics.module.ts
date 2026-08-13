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
 *
 * ⚠️ The class is named for its DIRECTORY (`modules/analytics/`), not for a
 * concept. It was briefly `InsightsModule`, and a concurrent session reading
 * `app.module.ts` reasonably concluded the import pointed at a
 * `modules/insights/` that does not exist — then deleted the registration,
 * which silently unmounted every `/api/admin/analytics/*` route while the
 * typecheck stayed green. A module whose name does not lead a reader to its
 * own file is a trap; do not rename this to something cleverer than its path.
 */
@Module({
  controllers: [AnalyticsController],
  providers: [OverviewService, LessonAnalyticsService, StudentAnalyticsService],
})
export class CohortAnalyticsModule {}
