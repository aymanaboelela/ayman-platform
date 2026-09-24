import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminUnlockCodesController } from './admin-unlock-codes.controller';
import { MyUnlockCodesController } from './my-unlock-codes.controller';
import { UnlockAttemptsService } from './unlock-attempts.service';
import { UnlockCodesService } from './unlock-codes.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [AdminUnlockCodesController, MyUnlockCodesController],
  providers: [UnlockCodesService, UnlockAttemptsService],
})
export class UnlockCodesModule {}
