import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
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
  // `NotificationsModule` depends on nothing but Prisma (see its own header
  // comment) — the same leaf `QuizModule` already imports to emit
  // `quiz_graded`/`extra_attempt_granted`. `LessonProgressService` and
  // `HeartbeatService` emit `exam_unlocked` the same way, from inside the
  // transaction that just cleared the course's last lecture.
  imports: [NotificationsModule],
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
