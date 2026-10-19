import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { PracticeGateService, PracticeOpenGuard } from './practice-gate.service';
import { PracticeController } from './practice.controller';
import { PracticeService } from './practice.service';

/**
 * «اختبارات مجانية». Owns `practice_sets` / `practice_questions` and reads
 * nothing of the quiz engine or the bank — see the model comment in
 * `schema.prisma`.
 */
@Module({
  imports: [AuditModule],
  controllers: [PracticeController],
  providers: [PracticeGateService, PracticeOpenGuard, PracticeService],
})
export class PracticeModule {}
