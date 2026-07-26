import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminQuestionsController } from './admin-questions.controller';
import { NoAnswerLeakInterceptor } from './interceptors/no-answer-leak.interceptor';
import { QuestionBankService } from './question-bank.service';

@Module({
  imports: [PrismaModule],
  controllers: [AdminQuestionsController],
  providers: [
    QuestionBankService,
    // Registering an APP_* provider from inside a feature module still applies
    // it globally (Nest hoists APP_* providers) — every future controller that
    // renders a question is covered the moment it adds @NoAnswerLeak(), with
    // no further wiring in app.module.ts.
    { provide: APP_INTERCEPTOR, useClass: NoAnswerLeakInterceptor },
  ],
  exports: [QuestionBankService],
})
export class QuizModule {}
