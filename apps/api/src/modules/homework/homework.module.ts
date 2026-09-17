import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProgressModule } from '../progress/progress.module';
import { AdminHomeworkController } from './admin-homework.controller';
import { HomeworkController } from './homework.controller';
import { HomeworkPurgeService } from './homework-purge.service';
import { HomeworkService } from './homework.service';

/**
 * الواجب.
 *
 * `ProgressModule` is imported for `LessonAccessService` — the single gate
 * every student-facing path here goes through, so enrolment, publication and
 * the progression lock are decided in the one place that already owns them
 * rather than re-derived. No cycle: nothing in progress reaches back here.
 *
 * `MediaModule` brings the upload pipeline AND the `MEDIA_STORAGE` binding the
 * delete path needs; `NotificationsModule` carries both directions of the
 * alert — the fan-out to `homework:read` when an answer arrives, and the
 * student's own notice when it has been marked.
 */
@Module({
  imports: [MediaModule, NotificationsModule, ProgressModule],
  controllers: [HomeworkController, AdminHomeworkController],
  providers: [HomeworkService, HomeworkPurgeService],
  // Exported so `ContentModule`'s lesson editor can ask how many submissions
  // are waiting on one lecture without a second copy of the query.
  exports: [HomeworkService],
})
export class HomeworkModule {}
