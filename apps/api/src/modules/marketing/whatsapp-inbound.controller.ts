import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { isOptOutMessage } from '@ayman/contracts/marketing/render';
import { Public } from '../../auth/decorators/public.decorator';
import { loadEnv } from '../../config/env';
import { CampaignService } from './campaign.service';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { tokensMatch } from '../../common/security/tokens-match';
import { WaBotService } from '../wa-bot/wa-bot.service';

/**
 * `POST /api/marketing/wa/inbound` — the sidecar relaying what a phone typed
 * back.
 *
 * `@Public()`, and that is not a gap: this is not a route a browser session
 * ever calls, so `AuthGuard`'s cookie check is simply the wrong question to
 * ask of it. What replaces it is `x-wa-token` — the SAME shared secret
 * `WhatsappDeviceService` sends outbound to the sidecar, checked here on the
 * way back in. Only the sidecar and this process ever hold it, and it never
 * reaches a browser.
 *
 * This is why the authorization matrix does not carry rows for this route —
 * see its `KNOWN_GAPS` entry. That file's whole model is "which of
 * anonymous/student/admin may call this", and none of the three is the actor
 * here; the actor is a container on the compose network. The token check
 * below is exercised directly in `whatsapp-inbound.controller.spec.ts`.
 *
 * ## «قف» here, everything else in the bot
 *
 * The stop word is still recognised HERE, first and unconditionally, so it
 * keeps working on a stack that has campaigns and no auto-reply bot. Every
 * message — «قف» included — is then handed to `WaBotService`, which records it
 * and answers it only when the `whatsapp.bot` entitlement is on (it checks
 * that itself; this route cannot be gated on it without gating «قف» too).
 *
 * A message typed on the linked handset arrives with `fromMe: true`. It is a
 * PERSON replying, never an opt-out, and it is what silences the bot in that
 * chat for a while.
 */
// ويب‌هوك الجهاز. مالوش لازمة من غير جهاز مرتبط، وبيتقفل مع الفيتشر.
@RequireFeature('marketing.whatsapp')
@Controller('marketing/wa')
export class WhatsappInboundController {
  private readonly logger = new Logger(WhatsappInboundController.name);

  constructor(
    private readonly campaigns: CampaignService,
    private readonly bot: WaBotService,
  ) {}

  @Public()
  @Post('inbound')
  async inbound(
    @Headers('x-wa-token') token: string | undefined,
    @Body()
    body: { phone?: unknown; text?: unknown; name?: unknown; messageId?: unknown; fromMe?: unknown },
  ): Promise<{ ok: true }> {
    const expected = loadEnv(process.env).WA_SERVICE_TOKEN;
    if (!tokensMatch(token, expected)) throw new UnauthorizedException();

    const phone = typeof body.phone === 'string' ? body.phone : null;
    const text = typeof body.text === 'string' ? body.text : null;
    if (!phone || !text) throw new BadRequestException('phone and text are required');

    const fromMe = body.fromMe === true;
    if (!fromMe && isOptOutMessage(text)) {
      // A phone that fails to normalise here is not this route's problem to
      // report — the sidecar has no retry logic and no interest in the
      // answer, and a 400 back to it would just be logged and dropped. Best
      // effort: if the number cannot be read as Egyptian, the opt-out is not
      // recorded, but the ack still tells the sidecar not to retry.
      await this.campaigns.addOptOut(phone, text.slice(0, 300)).catch(() => undefined);
    }

    // Same rule as the opt-out above: the sidecar has no use for a failure, so
    // a bot that cannot record a message logs it and the ack still goes back.
    await this.bot
      .recordInbound({
        phone,
        text,
        name: typeof body.name === 'string' ? body.name : null,
        messageId: typeof body.messageId === 'string' ? body.messageId : null,
        fromMe,
      })
      .catch((error: unknown) =>
        this.logger.warn(`wa-bot could not record an inbound message: ${error instanceof Error ? error.message : 'unknown'}`),
      );

    return { ok: true };
  }
}
