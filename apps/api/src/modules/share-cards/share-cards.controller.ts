import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import type { Request } from 'express';
import { createZodDto } from 'nestjs-zod';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  ShareCardRenderFailureSchema,
  type CertificatesPayload,
  type ResultCardPayload,
} from '@ayman/contracts/share-cards';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { ShareCardsService } from './share-cards.service';

class ShareCardRenderFailureDto extends createZodDto(ShareCardRenderFailureSchema) {}

/**
 * «كارت النتيجة» و«شهاداتي». Behind `shareCards` — on for Ayman, 404 on any
 * other stack until the owner opens it — and `quiz:read`, the permission every
 * student-facing results read already carries.
 */
@Controller('me/share-cards')
@RequireFeature('shareCards')
@RequirePermission('quiz:read')
export class ShareCardsController {
  constructor(
    private readonly cards: ShareCardsService,
    @InjectPinoLogger(ShareCardsController.name) private readonly logger: PinoLogger,
  ) {}

  @Get('attempts/:attemptId')
  resultCard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ): Promise<ResultCardPayload> {
    return this.cards.resultCard(user.id, attemptId);
  }

  @Get('certificates')
  certificates(@CurrentUser() user: AuthenticatedUser): Promise<CertificatesPayload> {
    return this.cards.certificates(user.id);
  }

  /**
   * A card that failed to draw on the student's phone — logged, nothing else.
   * See `ShareCardRenderFailureSchema` for why it exists. The user agent rides
   * along because the likeliest split between "works" and "doesn't" is the
   * browser, and that is the one fact the body cannot be trusted to carry.
   */
  @Post('render-failures')
  @HttpCode(204)
  @Throttle({ short: { limit: 3, ttl: seconds(10) }, medium: { limit: 20, ttl: seconds(600) } })
  renderFailure(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Body() body: ShareCardRenderFailureDto,
  ): void {
    const userAgent = String(request.headers['user-agent'] ?? '').slice(0, 300);
    this.logger.warn({ shareCardFailure: { ...body, userId: user.id, userAgent } }, 'share card failed to render');
  }
}
