import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProgressModule } from '../progress/progress.module';
import { AdminQuestionsController } from './admin-questions.controller';
import { AdminQuizzesController } from './admin-quizzes.controller';
import { AttemptController } from './attempt.controller';
import { NoAnswerLeakInterceptor } from './interceptors/no-answer-leak.interceptor';
import { OverdueService } from './overdue.service';
import { QuestionBankService } from './question-bank.service';
import { QuizAccessService } from './quiz-access.service';
import { QuizBuilderService } from './quiz-builder.service';
import { QuizScoreFeed } from './quiz-score-feed';
import { AttemptEventsService } from './attempt-events.service';
import { AttemptService } from './attempt.service';

@Module({
  // `ProgressModule` is imported (not just re-exported) so `AttemptService`
  // can inject Plan 4's `LessonProgressService` — the only way a quiz result
  // becomes lesson progress (Task 12).
  imports: [PrismaModule, ProgressModule],
  controllers: [AdminQuestionsController, AdminQuizzesController, AttemptController],
  providers: [
    QuestionBankService,
    QuizAccessService,
    AttemptEventsService,
    AttemptService,
    OverdueService,
    QuizScoreFeed,
    QuizBuilderService,
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
  ],
})
export class QuizModule {}
