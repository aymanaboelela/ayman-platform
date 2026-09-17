import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { BookOrdersModule } from '../book-orders/book-orders.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsController } from './payments.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import { AdminFinanceController } from './admin-finance.controller';
import { AdminStudentSubscriptionsController } from './admin-student-subscriptions.controller';
import { AdminTransfersController } from './admin-transfers.controller';
import { TransfersIngestController } from './transfers-ingest.controller';
import { transfersIngestBodyParser } from './transfers-ingest.body';
import { PaymentsService } from './payments.service';
import { FinanceService } from './finance.service';
import { SubscriptionExpirySweeper } from './subscription-expiry-sweeper.service';
import { TransfersService } from './transfers.service';

@Module({
  imports: [MediaModule, NotificationsModule, BookOrdersModule],
  controllers: [
    PaymentsController,
    AdminPaymentsController,
    AdminFinanceController,
    AdminStudentSubscriptionsController,
    AdminTransfersController,
    TransfersIngestController,
  ],
  providers: [
    PaymentsService,
    FinanceService,
    SubscriptionExpirySweeper,
    TransfersService,
  ],
})
export class PaymentsModule implements NestModule {
  /** `main.ts` bootstraps with `bodyParser: false`, so a content type nobody
   *  installed a parser for arrives with no body at all. See
   *  `transfersIngestBodyParser` for why this route accepts plain text. */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(transfersIngestBodyParser).forRoutes(TransfersIngestController);
  }
}
