import { Module } from '@nestjs/common';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { ProgressModule } from '../progress/progress.module';
import { QuizModule } from '../quiz/quiz.module';
import { QuizScoreFeed } from '../quiz/quiz-score-feed';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PathService } from './path.service';
import { SCORE_FEED } from './score-feed';

@Module({
  // RECONCILED — Plan 5 Task 12 rebinds SCORE_FEED from EmptyScoreFeed to a
  // quiz_attempts-backed implementation now that attempts exist. One line
  // below; no contract change, no UI change.
  imports: [EnrollmentModule, QuizModule, ProgressModule],
  controllers: [DashboardController],
  providers: [DashboardService, PathService, { provide: SCORE_FEED, useClass: QuizScoreFeed }],
  /*
   * Exported for `AssistantStudentService`, which renders a student's own
   * courses and marks into the assistant's prompt.
   *
   * `DashboardService` and nothing else: it is the one read here that is
   * already keyed on `userId` in every query, already tested, and already the
   * exact set of facts a student asks the assistant about. Exporting
   * `PathService` or the score feed would widen what the assistant can reach
   * for no question it needs to answer.
   */
  exports: [DashboardService],
})
export class DashboardModule {}
