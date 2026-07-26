import { Module } from '@nestjs/common';
import { CourseController } from './course.controller';
import { CourseService } from './course.service';
import { SectionController } from './section.controller';
import { SectionService } from './section.service';
import { LessonController } from './lesson.controller';
import { LessonService } from './lesson.service';

@Module({
  controllers: [CourseController, SectionController, LessonController],
  providers: [CourseService, SectionService, LessonService],
  exports: [CourseService, SectionService, LessonService],
})
export class ContentModule {}
