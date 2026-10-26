import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { QuizModule } from '../quiz/quiz.module';
import { ShareCardsController } from './share-cards.controller';
import { ShareCardsService } from './share-cards.service';

@Module({
  imports: [PrismaModule, QuizModule],
  controllers: [ShareCardsController],
  providers: [ShareCardsService],
})
export class ShareCardsModule {}
