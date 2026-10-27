import { Module } from '@nestjs/common';
import { OutreachModule } from '../outreach/outreach.module';
import { WhatsappDeviceService } from '../marketing/whatsapp-device.service';
import { AdminAutoOutreachController } from './admin-auto-outreach.controller';
import { AutoOutreachCandidates } from './auto-outreach-candidates.service';
import { AutoOutreachOverviewService } from './auto-outreach-overview.service';
import { AutoOutreachSweeper } from './auto-outreach.sweeper';
import { CheckoutIntentsController } from './checkout-intents.controller';
import { CheckoutIntentsService } from './checkout-intents.service';

/**
 * «رسايل الواتساب التلقائية» — checkout recovery and the signup nudge.
 *
 * `WhatsappDeviceService` is provided here directly rather than imported from
 * `MarketingModule`, because that module imports `OutreachModule` and this
 * one does too — reaching across would be a cycle for the sake of a class
 * whose only state is two env reads. It talks to the same sidecar either way.
 */
@Module({
  imports: [OutreachModule],
  controllers: [CheckoutIntentsController, AdminAutoOutreachController],
  providers: [
    CheckoutIntentsService,
    AutoOutreachCandidates,
    AutoOutreachOverviewService,
    AutoOutreachSweeper,
    WhatsappDeviceService,
  ],
})
export class AutoOutreachModule {}
