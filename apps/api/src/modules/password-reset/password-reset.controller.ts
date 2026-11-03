import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UsePipes,
} from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import type { Request, Response } from 'express';
import {
  PASSWORD_RESET_HUMAN_CHECK,
  PASSWORD_RESET_INVALID_CODE,
  PASSWORD_RESET_LIMITED,
  type PasswordResetConfirmResult,
  type PasswordResetRequestResult,
} from '@ayman/contracts/password-reset';
import { Public } from '../../auth/decorators/public.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { HUMAN_CHECK_HEADER } from '../../auth/human-check';
import { clientIpFromRequest } from '../../common/throttle/request-identity';
import { RequireCsrf } from '../security/require-csrf.decorator';
import { PasswordResetConfirmDto, PasswordResetRequestDto } from './password-reset.dto';
import { PasswordResetService } from './password-reset.service';

/**
 * The request-rate ceilings in FRONT of the service's own limits. These are
 * the global throttler's buckets (session-keyed, plus the unforgeable `ip`
 * one) tightened for two routes nobody needs to hit often; the limits that
 * actually protect the number are counted in Postgres by the service, where
 * a deploy does not reset them.
 */
const REQUEST_THROTTLE = {
  short: { limit: 2, ttl: seconds(5) },
  medium: { limit: 6, ttl: seconds(600) },
  ip: { limit: 30, ttl: seconds(600) },
};

/**
 * A code is six digits and burns after five wrong guesses, so guessing is
 * already bounded per code. This bounds the cost of trying: a client walking
 * numbers with random codes spends its bucket long before it finds a row.
 */
const CONFIRM_THROTTLE = {
  short: { limit: 3, ttl: seconds(5) },
  medium: { limit: 15, ttl: seconds(600) },
  ip: { limit: 40, ttl: seconds(600) },
};

/**
 * «نسيت كلمة السر». Both routes are `@Public()` — the whole point is that the
 * caller cannot sign in — and both carry `@RequireCsrf()`, the same as every
 * other public route that changes state. `@RequireFeature('passwordReset')`
 * makes them 404 on a stack where the owner has not opened it, before any of
 * this runs.
 */
@RequireFeature('passwordReset')
@Controller('password-reset')
@UsePipes(ZodValidationPipe)
export class PasswordResetController {
  constructor(private readonly resets: PasswordResetService) {}

  /**
   * 200 `{ status: 'accepted', handle }` for every number that clears the
   * limits, registered or not — the handle is minted for every one of them.
   * 200 `{ status: 'unavailable' }` when the STACK cannot send (no device, no
   * Turnstile, WhatsApp refusing new chats). 429 for a limit, 403 for a
   * failed human check — none of which depends on whether the number has an
   * account.
   */
  @Public()
  @RequireCsrf()
  @Throttle(REQUEST_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('request')
  async request(
    @Body() body: PasswordResetRequestDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PasswordResetRequestResult> {
    const captcha = request.headers[HUMAN_CHECK_HEADER];
    const remote = request.headers['cf-connecting-ip'];
    const { outcome } = await this.resets.request({
      phone: body.phoneNumber,
      ipBucket: clientIpFromRequest(request),
      remoteIp: (Array.isArray(remote) ? remote[0] : remote)?.trim() || null,
      captchaToken: (Array.isArray(captcha) ? captcha[0] : captcha) ?? null,
    });
    // The delivery the service scheduled is deliberately NOT awaited — see
    // `PasswordResetService.request`. The response is already decided.

    if (outcome.status === 'human_check') {
      throw new ForbiddenException({ code: PASSWORD_RESET_HUMAN_CHECK, message: 'human check failed' });
    }
    if (outcome.status === 'limited') {
      response.setHeader('Retry-After', String(outcome.retryAfterSeconds));
      throw new HttpException(
        { code: PASSWORD_RESET_LIMITED, message: 'too many requests', retryAfterSeconds: outcome.retryAfterSeconds },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return outcome.status === 'accepted' ? { status: 'accepted', handle: outcome.handle } : { status: 'unavailable' };
  }

  /**
   * 200 `{ status: 'reset' | 'google' }` on a right code; 400 with ONE code
   * for everything else — see `PasswordResetService.confirm`.
   */
  @Public()
  @RequireCsrf()
  @Throttle(CONFIRM_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('confirm')
  async confirm(@Body() body: PasswordResetConfirmDto): Promise<PasswordResetConfirmResult> {
    const outcome = await this.resets.confirm({
      phone: body.phoneNumber,
      handle: body.handle,
      code: body.code,
      newPassword: body.newPassword,
    });
    if (outcome.status === 'invalid') {
      throw new BadRequestException({ code: PASSWORD_RESET_INVALID_CODE, message: 'code not accepted' });
    }
    return outcome;
  }
}
