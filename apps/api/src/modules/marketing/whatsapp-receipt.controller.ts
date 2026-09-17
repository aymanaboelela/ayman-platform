import { BadRequestException, Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator';
import { loadEnv } from '../../config/env';
import { CampaignService } from './campaign.service';

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

@Controller('marketing/wa')
export class WhatsappReceiptController {
  constructor(private readonly campaigns: CampaignService) {}

  @Public()
  @Post('receipt')
  async receipt(
    @Headers('x-wa-token') token: string | undefined,
    @Body() body: { messageId?: unknown; status?: unknown; code?: unknown; detail?: unknown },
  ): Promise<{ ok: true }> {
    const expected = loadEnv(process.env).WA_SERVICE_TOKEN;
    if (!expected || !token || token !== expected) throw new UnauthorizedException();

    const messageId = typeof body.messageId === 'string' ? body.messageId : null;
    const status = typeof body.status === 'number' ? body.status : null;
    const detail = typeof body.detail === 'string' ? body.detail : null;
    if (!messageId || status === null) throw new BadRequestException('messageId and status are required');

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
      settle rows. What it does is write down WHAT WhatsApp said, on the row
      that said it, where the campaign screen already renders `error`.
     
      The one that matters is 463 — `MessageAccountRestriction`: a 1:1 message
      with no privacy token, which means WhatsApp is blocking this account from
      STARTING new chats while leaving existing conversations alone. A campaign
      is nothing but new chats, which is why every message failed identically
      and a reply typed by hand into an open chat went through seconds later.
     
      Without this, the fix built to explain the failure would have turned
      «٧٤ من ٧٤ · اتبعت» into «٧٤ فشل» and still never said the number.
    */
    if (status === REFUSED && detail) {
      await this.campaigns.markRefused(messageId, detail).catch(() => undefined);
    }

    return { ok: true };
  }
}
