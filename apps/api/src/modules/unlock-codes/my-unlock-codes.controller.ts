import { Body, Controller, Get, Post, Req, UsePipes } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import type { Request } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import type { MyUnlockCodes, RedeemUnlockCodeResponse } from '@ayman/contracts/unlock-codes';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { clientIpFromRequest } from '../../common/throttle/request-identity';
import { RequireCsrf } from '../security/require-csrf.decorator';
import { RedeemUnlockCodeDto } from './unlock-codes.dto';
import { UnlockCodesService } from './unlock-codes.service';

/**
 * A ceiling under the attempt ladder, for when Redis is down and the ladder
 * lets everything through: a student redeeming the three codes they bought is
 * nowhere near it, a script is.
 */
const REDEEM_THROTTLE = {
  short: { limit: 3, ttl: seconds(10) },
  medium: { limit: 20, ttl: seconds(600) },
};

/**
 * «كود الفتح» — the student's two routes, under `/api/me` with the rest of
 * what is theirs.
 *
 * `enrollment:create` for redeeming, because that is what it can do — it may
 * mint an enrollment — and `enrollment:read` for the history. No new student
 * permission: both are already in the student set and both resolve through
 * the session's own id, never a parameter.
 *
 * ⚠️ The code travels in the BODY, never the path: a path lands in every proxy
 * log, the browser history and the next page's `Referer`, and this is a key.
 */
@Controller('me/unlock-codes')
@UsePipes(ZodValidationPipe)
export class MyUnlockCodesController {
  constructor(private readonly codes: UnlockCodesService) {}

  @RequirePermission('enrollment:read')
  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<MyUnlockCodes> {
    return this.codes.listMine(user.id);
  }

  /**
   * `clientIpFromRequest`, not `request.ip` — behind Cloudflare and Traefik
   * `request.ip` is the edge's address, one per PoP, and a lock on it would
   * lock a whole city. See the guardian sign-in for the full story.
   */
  @RequirePermission('enrollment:create')
  @RequireCsrf()
  @Throttle(REDEEM_THROTTLE)
  @Post('redeem')
  redeem(
    @Body() body: RedeemUnlockCodeDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<RedeemUnlockCodeResponse> {
    return this.codes.redeem(user.id, clientIpFromRequest(request), body.code);
  }
}
