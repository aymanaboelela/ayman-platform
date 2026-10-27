import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { QuizModule } from '../quiz/quiz.module';
import { ShareCardsController } from './share-cards.controller';
import { ShareCardsService } from './share-cards.service';

@Module({
  imports: [PrismaModule, QuizModule],
  controllers: [ShareCardsController],
  providers: [ShareCardsService],
  // For the guardian report's certificates block — gated there on the same
  // `shareCards` entitlement this module's controller is.
  exports: [ShareCardsService],
})
export class ShareCardsModule {}
