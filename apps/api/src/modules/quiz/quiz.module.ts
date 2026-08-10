import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProgressModule } from '../progress/progress.module';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminAttemptsController } from './admin-attempts.controller';
import { AdminQuestionsController } from './admin-questions.controller';
import { AdminQuizzesController } from './admin-quizzes.controller';
import { AnalyticsService } from './analytics.service';
import { AttemptAdminService } from './attempt-admin.service';
import { AttemptController } from './attempt.controller';
import { MasteryService } from './mastery.service';
import { MeQuizzesController } from './me-quizzes.controller';
import { NoAnswerLeakInterceptor } from './interceptors/no-answer-leak.interceptor';
import { OverdueService } from './overdue.service';
import { QuestionBankService } from './question-bank.service';
import { QuizAccessService } from './quiz-access.service';
import { QuizBuilderService } from './quiz-builder.service';
import { QuizHistoryService } from './quiz-history.service';
import { QuizScoreFeed } from './quiz-score-feed';
import { AttemptEventsService } from './attempt-events.service';
import { AttemptService } from './attempt.service';

@Module({
  // `ProgressModule` is imported (not just re-exported) so `AttemptService`
  // can inject Plan 4's `LessonProgressService` — the only way a quiz result
  // becomes lesson progress (Task 12).
  imports: [PrismaModule, ProgressModule, NotificationsModule],
  controllers: [
    AdminQuestionsController,
    AdminQuizzesController,
    AttemptController,
    MeQuizzesController,
    AdminAttemptsController,
    AdminAnalyticsController,
  ],
  providers: [
    MasteryService,
    QuestionBankService,
    QuizAccessService,
    AttemptEventsService,
    AttemptService,
    OverdueService,
    QuizScoreFeed,
    QuizHistoryService,
    QuizBuilderService,
    AttemptAdminService,
    AnalyticsService,
    // Registering an APP_* provider from inside a feature module still applies
    // it globally (Nest hoists APP_* providers) — every future controller that
    // renders a question is covered the moment it adds @NoAnswerLeak(), with
    // no further wiring in app.module.ts.
    { provide: APP_INTERCEPTOR, useClass: NoAnswerLeakInterceptor },
  ],
  exports: [
    QuestionBankService,
    QuizAccessService,
    AttemptEventsService,
    AttemptService,
    OverdueService,
    QuizScoreFeed,
    QuizBuilderService,
    AttemptAdminService,
    AnalyticsService,
    // `QuizHistoryService` is deliberately NOT exported: its only consumer is
    // `MeQuizzesController`, in this module. Exporting it would invite another
    // module to reach past the `SCORE_FEED` port that keeps the dashboard
    // independent of quiz internals.
  ],
})
export class QuizModule {}
