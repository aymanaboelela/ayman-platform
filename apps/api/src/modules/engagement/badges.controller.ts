import { Controller, Get } from '@nestjs/common';
import type { BadgesPayload } from '@ayman/contracts/engagement';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { BadgesService } from './badges.service';

/** «أوسمتي» — `enrollment:read`, behind `badges`. */
@Controller('me/badges')
@RequireFeature('badges')
@RequirePermission('enrollment:read')
export class BadgesController {
  constructor(private readonly badges: BadgesService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<BadgesPayload> {
    return this.badges.forUser(user.id);
  }
}
