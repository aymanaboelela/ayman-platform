import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsRealtimeService } from './notifications-realtime.service';

/**
 * `NotificationsService` is EXPORTED, unlike most feature services here,
 * because `emit` is called from other modules — the quiz engine writes
 * `quiz_graded` and `extra_attempt_granted`, and `PaymentsService` writes
 * `payment_approved`/`payment_rejected`, each from inside its own transaction.
 *
 * That is the whole coupling: emitters depend on this module, and this module
 * depends on nothing but Prisma. Notifications never reach back into the quiz
 * engine to ask what happened; they are told.
 *
 * `NotificationsRealtimeService` is the fan-out behind the SSE stream. It
 * takes the shared `REDIS` client from the global `RedisModule`, so there is
 * nothing to import for it here — and it is exported alongside the service
 * because an emitter that has just committed calls `announce()` on the
 * service, never `publish()` directly.
 */
@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsRealtimeService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
