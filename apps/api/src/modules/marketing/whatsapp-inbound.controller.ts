import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { isOptOutMessage } from '@ayman/contracts/marketing/render';
import { Public } from '../../auth/decorators/public.decorator';
import { loadEnv } from '../../config/env';
import { CampaignService } from './campaign.service';

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
 * ## Why this only ever recognises «قف», never anything else
 *
 * A reply that is not the stop word is not this route's business. Building
 * this into a two-way chat would duplicate المساعد's open chat and give a
 * campaign message a reply button nothing else on the platform has.
 */
@Controller('marketing/wa')
export class WhatsappInboundController {
  constructor(private readonly campaigns: CampaignService) {}

  @Public()
  @Post('inbound')
  async inbound(
    @Headers('x-wa-token') token: string | undefined,
    @Body() body: { phone?: unknown; text?: unknown },
  ): Promise<{ ok: true }> {
    const expected = loadEnv(process.env).WA_SERVICE_TOKEN;
    if (!expected || !token || token !== expected) throw new UnauthorizedException();

    const phone = typeof body.phone === 'string' ? body.phone : null;
    const text = typeof body.text === 'string' ? body.text : null;
    if (!phone || !text) throw new BadRequestException('phone and text are required');

    if (isOptOutMessage(text)) {
      // A phone that fails to normalise here is not this route's problem to
      // report — the sidecar has no retry logic and no interest in the
      // answer, and a 400 back to it would just be logged and dropped. Best
      // effort: if the number cannot be read as Egyptian, the opt-out is not
      // recorded, but the ack still tells the sidecar not to retry.
      await this.campaigns.addOptOut(phone, text.slice(0, 300)).catch(() => undefined);
    }

    return { ok: true };
  }
}
