import { Module } from '@nestjs/common';
import { CourseProgressService } from './course-progress.service';
import { HeartbeatService } from './heartbeat.service';
import { LessonAccessService } from './lesson-access.service';
import { LessonProgressService } from './lesson-progress.service';
import { ProgressController } from './progress.controller';

@Module({
  controllers: [ProgressController],
  providers: [LessonAccessService, CourseProgressService, HeartbeatService, LessonProgressService],
  // `LessonProgressService` is exported so Plan 5's `QuizModule` can inject
  // it and call `recordQuizResult` — the only way a quiz result becomes
  // lesson progress. It carries no route of its own.
  exports: [LessonAccessService, CourseProgressService, LessonProgressService],
})
export class ProgressModule {}
