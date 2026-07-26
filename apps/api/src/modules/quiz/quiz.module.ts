import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminQuestionsController } from './admin-questions.controller';
import { QuestionBankService } from './question-bank.service';

@Module({
  imports: [PrismaModule],
  controllers: [AdminQuestionsController],
  providers: [QuestionBankService],
  exports: [QuestionBankService],
})
export class QuizModule {}
