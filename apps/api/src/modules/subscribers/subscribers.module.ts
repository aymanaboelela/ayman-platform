import { Module } from '@nestjs/common';
import { AdminSubscribersController } from './subscribers.controller';
import { SubscribersService } from './subscribers.service';

/**
 * «المشتركين» — who holds a paid course or month right now, and who does not.
 *
 * Its own module rather than more routes on `AnalyticsModule`: that one is on
 * `analytics:read` and ranks a cohort by scores, while every row here is a
 * name and a phone number, on `student:read` like `/admin/follow-up`.
 */
@Module({
  controllers: [AdminSubscribersController],
  providers: [SubscribersService],
})
export class SubscribersModule {}
