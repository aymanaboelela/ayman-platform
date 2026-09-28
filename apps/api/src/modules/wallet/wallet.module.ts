import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WalletController } from './wallet.controller';
import { AdminWalletController, AdminWalletTopupsController } from './admin-wallet.controller';
import { WalletService } from './wallet.service';

/**
 * «المحفظة». Money in and money out through `wallet-ledger.ts`; buying a
 * course with it lives with the rest of the purchase machinery in
 * `PaymentsModule`, which uses the same ledger functions directly.
 */
@Module({
  imports: [MediaModule, NotificationsModule],
  controllers: [WalletController, AdminWalletController, AdminWalletTopupsController],
  providers: [WalletService],
})
export class WalletModule {}
