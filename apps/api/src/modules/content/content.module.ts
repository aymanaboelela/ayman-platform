import { Module } from '@nestjs/common';
import { CourseController } from './course.controller';
import { CourseService } from './course.service';
import { SectionController } from './section.controller';
import { SectionService } from './section.service';
import { LessonController } from './lesson.controller';
import { LessonService } from './lesson.service';
import { TermController } from './term.controller';
import { TermService } from './term.service';
import { YouTubeDurationService } from './youtube-duration.service';

@Module({
  controllers: [CourseController, SectionController, LessonController, TermController],
  providers: [CourseService, SectionService, LessonService, TermService, YouTubeDurationService],
  exports: [CourseService, SectionService, LessonService, TermService],
})
export class ContentModule {}
