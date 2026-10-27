import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module';
import { ProgressModule } from '../progress/progress.module';
import { ShareCardsModule } from '../share-cards/share-cards.module';
import { MistakesModule } from '../mistakes/mistakes.module';
import { CentersModule } from '../centers/centers.module';
import { GuardianController } from './guardian.controller';
import { GuardianViewController } from './guardian-view.controller';
import { GuardianSessionService } from './guardian-session.service';
import { GuardianReportService } from './guardian-report.service';

/**
 * Every module imported here is imported for ONE read service the student's
 * own screen already uses — see `GuardianReportService`. None of their
 * controllers is reachable with a guardian session: the guard on each still
 * asks for a student session, and the guardian has none.
 */
@Module({
  imports: [DashboardModule, ProgressModule, ShareCardsModule, MistakesModule, CentersModule],
  controllers: [GuardianController, GuardianViewController],
  providers: [GuardianSessionService, GuardianReportService],
  exports: [GuardianSessionService],
})
export class GuardianModule {}
