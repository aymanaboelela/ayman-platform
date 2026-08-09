import { Module } from '@nestjs/common';
import { CourseController } from './course.controller';
import { CourseService } from './course.service';
import { SectionController } from './section.controller';
import { SectionService } from './section.service';
import { LessonController } from './lesson.controller';
import { LessonService } from './lesson.service';
import { YouTubeDurationService } from './youtube-duration.service';

@Module({
  controllers: [CourseController, SectionController, LessonController],
  providers: [CourseService, SectionService, LessonService, YouTubeDurationService],
  exports: [CourseService, SectionService, LessonService],
})
export class ContentModule {}
