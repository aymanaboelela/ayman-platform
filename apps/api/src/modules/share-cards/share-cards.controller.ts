import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { CertificatesPayload, ResultCardPayload } from '@ayman/contracts/share-cards';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { ShareCardsService } from './share-cards.service';

/**
 * «كارت النتيجة» و«شهاداتي». Behind `shareCards` — on for Ayman, 404 on any
 * other stack until the owner opens it — and `quiz:read`, the permission every
 * student-facing results read already carries.
 */
@Controller('me/share-cards')
@RequireFeature('shareCards')
@RequirePermission('quiz:read')
export class ShareCardsController {
  constructor(private readonly cards: ShareCardsService) {}

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
}
