import { Controller, Get } from '@nestjs/common';
import type { MyReferrals } from '@ayman/contracts/referrals';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { ReferralsService } from './referrals.service';

/**
 * «دعوة صحابك» — the student's half. Behind `referrals` (on for Ayman, 404 on
 * any other stack until the owner opens it) and `payment:submit`, the same
 * self-scoped permission the wallet uses: everything reads `user.id` off the
 * session, so there is no id here to point at somebody else's link.
 */
@Controller('me/referrals')
@RequireFeature('referrals')
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @RequirePermission('payment:submit')
  @Get()
  mine(@CurrentUser() user: AuthenticatedUser): Promise<MyReferrals> {
    return this.referrals.mine(user.id);
  }
}
