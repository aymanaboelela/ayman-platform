import { BadRequestException, Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { WaHistoryIngestSchema } from '@ayman/contracts/marketing/wa-history';
import { Public } from '../../auth/decorators/public.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { tokensMatch } from '../../common/security/tokens-match';
import { loadEnv } from '../../config/env';
import { WaHistoryService } from './wa-history.service';

/**
 * `POST /api/marketing/wa/history` — the sidecar reporting which numbers
 * already had a chat with the linked number when it was linked.
 *
 * ## Why `@Public()`, and why the authorization matrix has no rows for it
 *
 * The same shape as `WhatsappInboundController` and `WhatsappReceiptController`,
 * and the same token: no browser session ever calls this, so `AuthGuard`'s
 * cookie check is the wrong question. `x-wa-token` — the shared secret only the
 * sidecar and this process hold — is checked first, before the body is even
 * parsed, so an unauthenticated caller learns nothing about its shape. Its
 * `KNOWN_GAPS` entry in the matrix points here; the token check is exercised
 * in `wa-history-ingest.controller.spec.ts`.
 *
 * ## What it can and cannot do
 *
 * It writes counts and timestamps into `wa_history_chats` and NOTHING else —
 * no inbox row, no bot reply, no opt-out, no lead. A forged call (which needs
 * the token) could at worst mark a number as «كلّمني», which moves it into
 * the SAFER campaign audience's filter; it can never send a message.
 *
 * Behind `whatsapp.history`: on a stack without it this answers 404 and the
 * sidecar stops retrying (`history-chats.mjs` treats a 4xx as final).
 */
@RequireFeature('whatsapp.history')
@Controller('marketing/wa')
export class WaHistoryIngestController {
  constructor(private readonly history: WaHistoryService) {}

  @Public()
  @Post('history')
  async ingest(
    @Headers('x-wa-token') token: string | undefined,
    @Body() body: unknown,
  ): Promise<{ ok: true; stored: number; skipped: number }> {
    const expected = loadEnv(process.env).WA_SERVICE_TOKEN;
    if (!tokensMatch(token, expected)) throw new UnauthorizedException();

    const parsed = WaHistoryIngestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('entries must be 1–1000 history rows');

    const result = await this.history.ingest(parsed.data.entries);
    return { ok: true, ...result };
  }
}
