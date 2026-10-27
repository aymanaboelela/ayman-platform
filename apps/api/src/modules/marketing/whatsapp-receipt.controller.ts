import { BadRequestException, Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator';
import { loadEnv } from '../../config/env';
import { CampaignService } from './campaign.service';
import { WhatsappDeviceService } from './whatsapp-device.service';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { tokensMatch } from '../../common/security/tokens-match';

/**
 * `POST /api/marketing/wa/receipt` — the second tick, arriving.
 *
 * ## What this route is for
 *
 * Until it existed, the platform could not tell a campaign that reached
 * seventy-four people from one that reached nobody. `CampaignRunner` wrote
 * `status: 'sent'` the moment the sidecar's HTTP call returned, and that call
 * returns when `sock.sendMessage()` resolves — which means WhatsApp's servers
 * took custody of the stanza and NOTHING more. One grey tick. So a campaign
 * in which every message was accepted and none was delivered reported
 * «٧٤ من ٧٤ · اتبعت · ٠ فشل»: byte-identical to a flawless run, with no
 * error anywhere, for weeks, until the instructor happened to look at the
 * ticks on his own phone.
 *
 * WhatsApp was reporting delivery the whole time and the sidecar had no
 * listener for it. It does now (`services/wa/src/receipt-store.mjs`), and this
 * is where those receipts land.
 *
 * ## Why `@Public()`
 *
 * Same reasoning as `WhatsappInboundController`, and the same token: this is
 * not a route a browser session ever calls, so `AuthGuard`'s cookie check is
 * the wrong question. `x-wa-token` — the shared secret `WhatsappDeviceService`
 * already sends OUTBOUND to the sidecar — is checked here on the way back in.
 * Only the sidecar and this process hold it, and it never reaches a browser.
 * The authorization matrix carries no rows for it for the same reason it
 * carries none for the inbound route: none of anonymous/student/admin is the
 * actor, a container on the compose network is.
 *
 * ## Why it always answers `ok`
 *
 * The sidecar has no retry logic and no interest in the answer; a 4xx would
 * be logged there and dropped. A receipt for a message this platform has no
 * row for is normal, not an error — the shipping-notice path sends on the
 * same device, and so does any message the instructor types on his own phone
 * while the sidecar is linked. Those simply match nothing.
 */

/** `proto.WebMessageInfo.Status`. Mirrors `services/wa/src/receipt-store.mjs`. */
const REFUSED = 0;
const DELIVERY_ACK = 3;


@RequireFeature('marketing.whatsapp')
@Controller('marketing/wa')
export class WhatsappReceiptController {
  constructor(
    private readonly campaigns: CampaignService,
    private readonly device: WhatsappDeviceService,
  ) {}

  @Public()
  @Post('receipt')
  async receipt(
    @Headers('x-wa-token') token: string | undefined,
    @Body() body: { messageId?: unknown; status?: unknown; code?: unknown; detail?: unknown },
  ): Promise<{ ok: true }> {
    const expected = loadEnv(process.env).WA_SERVICE_TOKEN;
    if (!tokensMatch(token, expected)) throw new UnauthorizedException();

    const messageId = typeof body.messageId === 'string' ? body.messageId : null;
    const status = typeof body.status === 'number' ? body.status : null;
    // The CODE is what counts; its Arabic sentence is applied here from the
    // contracts copy (`waErrorFor`). An older sidecar image also sent a
    // `detail` sentence of its own — ignored, so the three screens that show a
    // refusal can never disagree about what it means.
    const code =
      typeof body.code === 'string' && /^[\w-]{1,16}$/u.test(body.code) ? body.code : null;
    if (!messageId || status === null) throw new BadRequestException('messageId and status are required');

    // The ledger first: it covers EVERY message the number sent — shipping
    // notices and test sends as well as campaign rows — and is what the
    // device page's delivery rate is read from.
    await this.device.recordReceipt(messageId, status, code).catch(() => undefined);

    // Anything at or above DELIVERY_ACK means a device has it — READ (4) and
    // PLAYED (5) both imply delivery, and a read receipt can be parsed before
    // the delivery receipt that logically preceded it. SERVER_ACK is the tick
    // already assumed and is ignored.
    if (status >= DELIVERY_ACK) {
      await this.campaigns.markDelivered(messageId).catch(() => undefined);
      return { ok: true };
    }

    /*
      ⚠️ A REFUSAL, AND ITS REASON. This is the line the whole exercise was for.

      The status is NOT changed to `failed`: the runner owns attempts and
      retries, and a route reachable without a session must not be able to
      settle rows. What it does is write down WHAT WhatsApp said — the code and
      its Arabic sentence — on the row that said it.

      The one that matters is 463: WhatsApp blocking this account from
      STARTING new chats. On a brand-new number every message is a new chat.
    */
    if (status === REFUSED) {
      await this.campaigns.markRefused(messageId, code).catch(() => undefined);
    }

    return { ok: true };
  }
}
