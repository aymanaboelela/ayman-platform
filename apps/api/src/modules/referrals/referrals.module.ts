import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MarketingModule } from '../marketing/marketing.module';
import { AdminReferralsController } from './admin-referrals.controller';
import { ReferralNoticeService } from './referral-notice.service';
import { ReferralSweeper } from './referral-sweeper.service';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

/**
 * «دعوة الصحاب». Money moves through `wallet-ledger.ts` directly, the way
 * `PaymentsModule` does it — no import of `WalletModule`. `MarketingModule`
 * for `WhatsappDeviceService`, the one file that talks to the sidecar.
 */
@Module({
  imports: [AuditModule, NotificationsModule, MarketingModule],
  controllers: [ReferralsController, AdminReferralsController],
  providers: [ReferralsService, ReferralSweeper, ReferralNoticeService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
