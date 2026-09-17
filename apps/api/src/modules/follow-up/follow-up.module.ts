import { Module } from '@nestjs/common';
import { OutreachModule } from '../outreach/outreach.module';
import { AdminFollowUpController } from './follow-up.controller';
import { FollowUpService } from './follow-up.service';

/**
 * «متابعة الطلبة».
 *
 * A module of its own rather than two more files inside `OutreachModule`, and
 * the direction of the import is the reason: this one reads enrollments,
 * lesson progress and attempts to decide WHO, then hands the answer to
 * `OutreachService` to decide HOW it is worded and written. Outreach has never
 * heard of it, exactly as it has never heard of the quiz engine — see that
 * module's own note on why that direction is worth protecting.
 */
@Module({
  imports: [OutreachModule],
  controllers: [AdminFollowUpController],
  providers: [FollowUpService],
})
export class FollowUpModule {}
