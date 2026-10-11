import { Body, Controller, HttpCode, Param, Post, UnauthorizedException, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';

import { Public } from '../../../auth/decorators/public.decorator';
import { RequireFeature } from '../../../auth/decorators/require-feature.decorator';
import { tokensMatch } from '../../../common/security/tokens-match';
import { loadEnv } from '../../../config/env';
import { BookOrderCourierService } from './book-order-courier.service';
import { TorodWebhookDto } from './torod-webhook.dto';

/**
 * `POST /api/webhooks/torod/:token` — the courier telling us where a parcel is.
 *
 * ## Why the token is in the PATH
 *
 * Their integration has one field for us: a URL («Web Hock»). No header, no
 * signature, nothing in the PDF about authentication at all. So the secret
 * rides in the only place they will carry it, and is compared in full before
 * the body is read — the same posture as `TransfersIngestController`, whose
 * request can likewise move an order (here: to «اتسلّم», which tells a student
 * their book arrived). Unset `TOROD_WEBHOOK_TOKEN` refuses everything.
 *
 * ⚠️ DORMANT as of 2026-10-05. Torod answered «عكس الحالات غير متاح — فقط
 * اضافة شحنات»: their system does not call anyone yet. Until it does, an order
 * sits in `courier` until the admin presses «اتشحن» / «وصل» by hand, which both
 * accept from `courier`. They promised a status-inquiry request keyed on
 * `sender_Code` (our `BK-` ref) «خلال أيام» — when it lands, a poller feeding
 * `BookOrderCourierService.ingest` is the whole change; the route stays for the
 * day they enable push.
 *
 * `@Public()` because the caller is their server, not a browser — no session,
 * no CSRF. The authorization matrix lists it as a documented gap for that
 * reason, like the InstaPay ingest.
 */
@RequireFeature('books.courier')
@Controller('webhooks/torod')
export class TorodWebhookController {
  constructor(private readonly courier: BookOrderCourierService) {}

  @Public()
  @HttpCode(200)
  @UsePipes(ZodValidationPipe)
  @Post(':token')
  async receive(@Param('token') token: string, @Body() body: TorodWebhookDto) {
    if (!tokensMatch(token, loadEnv(process.env).TOROD_WEBHOOK_TOKEN)) throw new UnauthorizedException();
    const result = await this.courier.ingest(body.orders);
    return { ok: true, ...result };
  }
}
