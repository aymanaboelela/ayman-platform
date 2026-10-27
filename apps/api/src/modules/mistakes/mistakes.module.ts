import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MistakesGateService, MistakesOpenGuard } from './mistakes-gate.service';
import { MistakesController } from './mistakes.controller';
import { MistakesService } from './mistakes.service';

/**
 * «دفتر غلطاتي». بيقرا `attempt_questions` (محرك الكويز) وبيكتب في
 * `mistake_reviews` بتاعه بس — شوف تعليق الموديل في `schema.prisma`.
 */
@Module({
  imports: [PrismaModule],
  controllers: [MistakesController],
  providers: [MistakesGateService, MistakesOpenGuard, MistakesService],
  // The guardian report's «محتاج يتراجع» reads the notebook through the gate,
  // so a stack with the notebook closed shows the parent nothing of it.
  exports: [MistakesGateService, MistakesService],
})
export class MistakesModule {}
