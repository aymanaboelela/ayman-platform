import { Module } from '@nestjs/common';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { MediaModule } from '../media/media.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminDailyEssayController } from './admin-daily-essay.controller';
import { DailyEssayController } from './daily-essay.controller';
import { DailyEssayPurgeService } from './daily-essay-purge.service';
import { DailyEssayService } from './daily-essay.service';

/**
 * «السؤال المقالي اليومي».
 *
 * `EnrollmentModule` answers «whose question is this» (live access to a
 * course), `MediaModule` brings the private-image pipeline and the storage
 * binding the delete path needs, and `NotificationsModule` tells the student
 * their answer has a mark on it.
 */
@Module({
  imports: [EnrollmentModule, MediaModule, NotificationsModule],
  controllers: [DailyEssayController, AdminDailyEssayController],
  providers: [DailyEssayService, DailyEssayPurgeService],
})
export class DailyEssayModule {}
