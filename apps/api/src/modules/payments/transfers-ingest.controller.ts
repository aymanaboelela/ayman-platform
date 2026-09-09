import { Body, Controller, Headers, Post, UnauthorizedException, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type { IngestTransfersResult } from '@ayman/contracts/admin/transfers';

import { Public } from '../../auth/decorators/public.decorator';
import { loadEnv } from '../../config/env';
import { IngestTransfersDto } from './payments.dto';
import { TransfersService } from './transfers.service';

/**
 * `POST /api/ingest/transfers` — what the phone that received the money saw.
 *
 * ## Why this is `@Public()`
 *
 * The caller is the Android handset that receives the money, not a browser:
 * a notification listener on it forwards each InstaPay push as it appears.
 * There is no session to check, exactly as with `WhatsappInboundController` —
 * and for the same reason the authorization matrix carries no rows for it,
 * only a `KNOWN_GAPS` entry, since none of anonymous/student/admin is the
 * actor here.
 *
 * `x-instapay-token` replaces the cookie. Unlike the WhatsApp sidecar's token
 * this endpoint is reachable from the open internet — the handset is on wifi,
 * not on the compose network — and a request accepted here can open a paid
 * course. So an unset token disables the route outright rather than waving
 * requests through, and the header is compared in full before anything is
 * parsed.
 *
 * Accepts `text/plain` as well as JSON — see `transfersIngestBodyParser` for
 * why a device-built JSON body is a liability.
 */
@Controller('ingest')
export class TransfersIngestController {
  constructor(private readonly transfers: TransfersService) {}

  @Public()
  @UsePipes(ZodValidationPipe)
  @Post('transfers')
  async ingest(
    @Headers('x-instapay-token') token: string | undefined,
    @Body() body: IngestTransfersDto,
  ): Promise<IngestTransfersResult> {
    const expected = loadEnv(process.env).INSTAPAY_INGEST_TOKEN;
    if (!expected || !token || token !== expected) throw new UnauthorizedException();
    return this.transfers.ingest(body);
  }
}
