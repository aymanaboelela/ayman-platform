import { Module } from '@nestjs/common';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { EmptyScoreFeed, SCORE_FEED } from './score-feed';

@Module({
  imports: [EnrollmentModule],
  controllers: [DashboardController],
  providers: [DashboardService, { provide: SCORE_FEED, useClass: EmptyScoreFeed }],
})
export class DashboardModule {}
