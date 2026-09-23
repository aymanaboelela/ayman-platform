import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module';
import { GuardianController } from './guardian.controller';
import { GuardianViewController } from './guardian-view.controller';
import { GuardianSessionService } from './guardian-session.service';

@Module({
  imports: [DashboardModule],
  controllers: [GuardianController, GuardianViewController],
  providers: [GuardianSessionService],
  exports: [GuardianSessionService],
})
export class GuardianModule {}
