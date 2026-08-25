import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * `NotificationsService` is EXPORTED, unlike most feature services here,
 * because `emit` is called from other modules — the quiz engine writes
 * `quiz_graded` and `extra_attempt_granted`, and `PaymentsService` writes
 * `payment_approved`/`payment_rejected`, each from inside its own transaction.
 *
 * That is the whole coupling: emitters depend on this module, and this module
 * depends on nothing but Prisma. Notifications never reach back into the quiz
 * engine to ask what happened; they are told.
 */
@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
