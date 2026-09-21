import { Module } from '@nestjs/common';
import { CourseController } from './course.controller';
import { CourseService } from './course.service';
import { SectionController } from './section.controller';
import { SectionService } from './section.service';
import { LessonController } from './lesson.controller';
import { LessonService } from './lesson.service';
import { TermController } from './term.controller';
import { TermService } from './term.service';
import { CourseMonthController } from './course-month.controller';
import { CourseMonthService } from './course-month.service';
import { YouTubeDurationService } from './youtube-duration.service';
import { VideoMirrorModule } from '../video-mirror/video-mirror.module';
import { LessonPublishSweeper } from './lesson-publish-sweeper.service';

// `VideoMirrorModule` so a lecture whose video changed — or whose copy
// failed — can be put back in the queue from the same place the video is
// edited. No cycle: the mirror module knows nothing about content.
@Module({
  imports: [VideoMirrorModule],
  controllers: [
    CourseController,
    SectionController,
    LessonController,
    TermController,
    CourseMonthController,
  ],
  providers: [
    CourseService,
    SectionService,
    LessonService,
    TermService,
    // «شهور المنهج». Sibling of `TermService` and registered beside it —
    // it also owns `PUT /admin/lessons/:id/months`, which is a lesson route
    // on a month service rather than a month table `LessonService` would
    // otherwise have to learn about.
    CourseMonthService,
    YouTubeDurationService,
    // «تنزل الساعة ٨». Registered here rather than in a module of its own —
    // it publishes lessons, which is this module's subject, and `@Cron` needs
    // nothing but for the provider to be instantiated somewhere.
    LessonPublishSweeper,
  ],
  exports: [CourseService, SectionService, LessonService, TermService, CourseMonthService],
})
export class ContentModule {}
