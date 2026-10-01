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
})
export class MistakesModule {}
