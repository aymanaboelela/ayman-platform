import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsController } from './payments.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import { AdminFinanceController } from './admin-finance.controller';
import { PaymentsService } from './payments.service';
import { FinanceService } from './finance.service';
import { SubscriptionExpirySweeper } from './subscription-expiry-sweeper.service';

@Module({
  imports: [MediaModule, NotificationsModule],
  controllers: [PaymentsController, AdminPaymentsController, AdminFinanceController],
  providers: [PaymentsService, FinanceService, SubscriptionExpirySweeper],
})
export class PaymentsModule {}
