import { Module, type OnModuleInit } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { BooksModule } from '../books/books.module';
import { MarketingModule } from '../marketing/marketing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OutreachModule } from '../outreach/outreach.module';
import { MediaModule } from '../media/media.module';
import { BookOrdersController } from './book-orders.controller';
import { AdminBookOrdersController } from './admin-book-orders.controller';
import { BookOrdersService } from './book-orders.service';
import { warmReceiptOcr } from './receipt-ocr';

/**
 * `AuthModule` — for `OptionalSessionService`, which `BookOrdersController`'s
 * public routes need (a guest checkout has to work with or without a
 * session; see the controller's own note). Same dependency `AssistantModule`
 * has, for the same reason.
 */
@Module({
  imports: [MediaModule, AuthModule, BooksModule, NotificationsModule, MarketingModule, OutreachModule],
  controllers: [BookOrdersController, AdminBookOrdersController],
  providers: [BookOrdersService],
  // «التحويلات الواردة» settles a paid book the same way it settles a
  // subscription — see `TransfersService`, which lives in `PaymentsModule`.
  exports: [BookOrdersService],
})
export class BookOrdersModule implements OnModuleInit {
  /**
   * Start the receipt OCR engine at boot.
   *
   * ⚠️ Here and not on the first payment. Loading the model stalls the thread
   * that asks for it, and the first request after a deploy is the worst place
   * to put that — a student who has already transferred the money, waiting on a
   * spinner. Doing it now means the stall lands on an idle process instead.
   *
   * Not awaited, and it cannot fail: `warmReceiptOcr` swallows everything, and
   * a reader that finds no engine answers «مقريتش» — which the payment path
   * already treats as a normal outcome.
   */
  onModuleInit(): void {
    warmReceiptOcr();
  }
}
