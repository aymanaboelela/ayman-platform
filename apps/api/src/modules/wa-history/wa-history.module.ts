import { Module } from '@nestjs/common';
import { WaBotIdentityService } from '../wa-bot/wa-bot-identity.service';
import { WaHistoryIngestController } from './wa-history-ingest.controller';
import { WaHistoryController } from './wa-history.controller';
import { WaHistoryService } from './wa-history.service';

/**
 * «مين كلّمني على واتساب» — the linked number's chats from before it was
 * linked. See `marketing/wa-history.ts` in the contracts.
 *
 * `WaBotIdentityService` is provided here rather than imported through
 * `WaBotModule`: it is a stateless Prisma lookup, and importing the bot's
 * module would bring its replier loop and its controller along for one
 * method. Same reasoning `WaBotModule` gives for `WhatsappDeviceService`.
 *
 * The two reads the filters need (`wa-history.queries.ts`) are plain
 * functions over the caller's own Prisma, so nothing else imports this.
 */
@Module({
  controllers: [WaHistoryIngestController, WaHistoryController],
  providers: [WaHistoryService, WaBotIdentityService],
})
export class WaHistoryModule {}
