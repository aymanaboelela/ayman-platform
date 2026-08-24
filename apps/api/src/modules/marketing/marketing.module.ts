import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { EnvMediaUrlResolver, MEDIA_URL_RESOLVER } from '../../common/media/media-url';
import { AudienceService } from './audience.service';
import { CampaignRunner } from './campaign-runner.service';
import { CampaignService } from './campaign.service';
import { MarketingController } from './marketing.controller';
import { WhatsappInboundController } from './whatsapp-inbound.controller';
import { WhatsappDeviceService } from './whatsapp-device.service';

/**
 * التسويق — outbound WhatsApp.
 *
 * `MEDIA_URL_RESOLVER` is bound here rather than imported from `PlayerModule`,
 * which is the only other module that binds it. Both bindings are the same
 * stateless class over the same env variable, and importing the player — a
 * module about lessons and video — into the marketing module purely to borrow
 * a string concatenation would be the wrong dependency to create.
 *
 * A campaign's image reaches WhatsApp as a URL the sidecar downloads, so the
 * origin has to be the same public `MEDIA_BASE_URL` the browser would use.
 */
@Module({
  imports: [AuditModule],
  controllers: [MarketingController, WhatsappInboundController],
  providers: [
    CampaignService,
    AudienceService,
    WhatsappDeviceService,
    CampaignRunner,
    { provide: MEDIA_URL_RESOLVER, useClass: EnvMediaUrlResolver },
  ],
  exports: [CampaignService],
})
export class MarketingModule {}
