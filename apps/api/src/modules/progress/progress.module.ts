import { Module } from '@nestjs/common';
import { EntitlementModule } from '../entitlement/entitlement.module';
import { CourseProgressService } from './course-progress.service';
import { HeartbeatService } from './heartbeat.service';
import { LessonAccessService } from './lesson-access.service';
import { LessonGateService } from './lesson-gate.service';
import { LessonProgressService } from './lesson-progress.service';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { ProgressController } from './progress.controller';
import { ViewSessionService } from './view-session.service';

@Module({
  // `EntitlementModule` is imported so `LessonAccessService.require()` can
  // inject `EntitlementService` and re-check the live `AccessGrant` behind an
  // enrollment on every lesson open — see the comment on that check. No
  // cycle: `EntitlementModule` (and the `EnrollmentModule` it imports) never
  // imports `ProgressModule`.
  imports: [EntitlementModule],
  controllers: [ProgressController, ActivityController],
  providers: [
    LessonAccessService,
    LessonGateService,
    CourseProgressService,
    HeartbeatService,
    LessonProgressService,
    ViewSessionService,
    ActivityService,
  ],
  // `LessonProgressService` is exported so Plan 5's `QuizModule` can inject
  // it and call `recordQuizResult` — the only way a quiz result becomes
  // lesson progress. It carries no route of its own.
  exports: [LessonAccessService, LessonGateService, CourseProgressService, LessonProgressService],
})
export class ProgressModule {}
