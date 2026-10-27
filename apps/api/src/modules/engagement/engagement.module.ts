import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { ProgressModule } from '../progress/progress.module';
import { BadgesController } from './badges.controller';
import { BadgesService } from './badges.service';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { DailyController } from './daily.controller';
import { DailyService } from './daily.service';
import { FocusController } from './focus.controller';
import { FocusService } from './focus.service';
import { LeagueController } from './league.controller';
import { LeagueService } from './league.service';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';
import { PlanController } from './plan.controller';
import { PlanService } from './plan.service';
import { RecapController } from './recap.controller';
import { RecapService } from './recap.service';

/**
 * «سؤال اليوم», «ملاحظاتي», «خطة المذاكرة», «أوسمتي», «ملخص الشهر»,
 * «بطاقات المراجعة», «أوضة المذاكرة», «دوري الأسبوع» — see
 * `contracts/engagement.ts`. One module because they share the student's own
 * rows and feed each other (the daily card's days are a badge and league
 * points; focus sittings are both too), but one controller per feature, each
 * behind its own entitlement, so the owner can open them for a teacher one at
 * a time.
 */
@Module({
  imports: [PrismaModule, EnrollmentModule, ProgressModule, DashboardModule],
  controllers: [
    DailyController,
    NotesController,
    PlanController,
    BadgesController,
    RecapController,
    CardsController,
    FocusController,
    LeagueController,
  ],
  providers: [
    DailyService,
    NotesService,
    PlanService,
    BadgesService,
    RecapService,
    CardsService,
    FocusService,
    LeagueService,
  ],
})
export class EngagementModule {}
