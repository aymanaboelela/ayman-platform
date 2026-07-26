import { Module } from '@nestjs/common';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { QuizModule } from '../quiz/quiz.module';
import { QuizScoreFeed } from '../quiz/quiz-score-feed';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { SCORE_FEED } from './score-feed';

@Module({
  // RECONCILED — Plan 5 Task 12 rebinds SCORE_FEED from EmptyScoreFeed to a
  // quiz_attempts-backed implementation now that attempts exist. One line
  // below; no contract change, no UI change.
  imports: [EnrollmentModule, QuizModule],
  controllers: [DashboardController],
  providers: [DashboardService, { provide: SCORE_FEED, useClass: QuizScoreFeed }],
})
export class DashboardModule {}
