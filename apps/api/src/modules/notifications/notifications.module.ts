import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsRealtimeService } from './notifications-realtime.service';
import { PushService } from './push.service';

/**
 * `NotificationsService` is EXPORTED, unlike most feature services here,
 * because `emit`/`emitToPermission`/`notifyPermission` are called from other
 * modules — the quiz engine writes `quiz_graded` and `extra_attempt_granted`,
 * `PaymentsService` writes `payment_approved`/`payment_rejected`/
 * `payment_submitted`, and `AssistantController` writes
 * `assistant_question_received` — each from inside its own transaction, or
 * (the assistant's case) via `notifyPermission`'s own.
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
 *
 * `PushService` is the OTHER fan-out `announce()` reaches for — the one that
 * wakes a browser with no tab open. Not exported: nothing outside this module
 * writes a `PushSubscription` row directly, only `NotificationsController`'s
 * own `/me/push/*` routes and `NotificationsService.announce` reach it.
 */
@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsRealtimeService, PushService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
