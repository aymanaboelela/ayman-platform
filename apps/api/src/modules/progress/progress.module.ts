import { Module } from '@nestjs/common';
import { CourseProgressService } from './course-progress.service';
import { HeartbeatService } from './heartbeat.service';
import { LessonAccessService } from './lesson-access.service';
import { ProgressController } from './progress.controller';

@Module({
  controllers: [ProgressController],
  providers: [LessonAccessService, CourseProgressService, HeartbeatService],
  exports: [LessonAccessService, CourseProgressService],
})
export class ProgressModule {}
