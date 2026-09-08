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
import { VideoMirrorModule } from '../video-mirror/video-mirror.module';

// `VideoMirrorModule` so a lecture whose video changed — or whose copy
// failed — can be put back in the queue from the same place the video is
// edited. No cycle: the mirror module knows nothing about content.
@Module({
  imports: [VideoMirrorModule],
  controllers: [CourseController, SectionController, LessonController, TermController],
  providers: [CourseService, SectionService, LessonService, TermService, YouTubeDurationService],
  exports: [CourseService, SectionService, LessonService, TermService],
})
export class ContentModule {}
