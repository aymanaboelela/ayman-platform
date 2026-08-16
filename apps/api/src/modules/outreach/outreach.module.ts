import { Module } from '@nestjs/common';
import { SettingsModule } from '../admin/settings/settings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminOutreachController } from './admin-outreach.controller';
import { OutreachLogService } from './outreach-log.service';
import { OutreachSweeper } from './outreach-sweeper.service';
import { OutreachService } from './outreach.service';

/**
 * «رسايل م. أيمن».
 *
 * Note what this module does NOT import: `QuizModule`. The result messages are
 * driven by a sweep over `quiz_attempts`, not by a call from the grading path,
 * so the dependency runs one way — outreach reads the quiz tables and the quiz
 * engine has never heard of outreach. That is what keeps a bug in a friendly
 * message from being able to fail an exam submission (`OutreachService`).
 */
@Module({
  imports: [NotificationsModule, SettingsModule],
  controllers: [AdminOutreachController],
  providers: [OutreachService, OutreachLogService, OutreachSweeper],
  exports: [OutreachService],
})
export class OutreachModule {}
