import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { AssistantModule } from '../assistant/assistant.module';
import { WhatsappDeviceService } from '../marketing/whatsapp-device.service';
import { WaBotBrainService } from './wa-bot-brain.service';
import { WaBotController } from './wa-bot.controller';
import { WaBotFactsService } from './wa-bot-facts.service';
import { WaBotIdentityService } from './wa-bot-identity.service';
import { WaBotReplier } from './wa-bot-replier.service';
import { WaBotService } from './wa-bot.service';
import { WaBotSettingsService } from './wa-bot-settings.service';

/**
 * «الرد الآلي» — the WhatsApp auto-reply bot.
 *
 * ## Why `WhatsappDeviceService` is provided here and not imported
 *
 * `MarketingModule` owns the device and IMPORTS this module (its inbound
 * webhook hands every message to `WaBotService`), so importing it back would
 * be a cycle. The service is a stateless wrapper over two env variables and a
 * `fetch` — a second instance is the same HTTP client, not a second device.
 * The sidecar itself serialises every send whichever instance asks.
 *
 * `AssistantModule` for المساعد's model, the optional fallback for questions
 * no rule matched.
 */
@Module({
  imports: [AuditModule, AssistantModule],
  controllers: [WaBotController],
  providers: [
    WaBotService,
    WaBotReplier,
    WaBotBrainService,
    WaBotFactsService,
    WaBotIdentityService,
    WaBotSettingsService,
    WhatsappDeviceService,
  ],
  exports: [WaBotService],
})
export class WaBotModule {}
