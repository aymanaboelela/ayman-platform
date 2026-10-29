import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { SocialCounts } from '@ayman/contracts/admin/social-counts';
import { Public } from '../../../auth/decorators/public.decorator';
import { RequireFeature } from '../../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../../auth/decorators/require-permission.decorator';
import { PUBLIC_CONFIG_THROTTLE } from './settings.controller';
import { SettingsService } from './settings.service';

/**
 * «عدد السوشيال ميديا» — follower counts the admin types in, read by the
 * landing page.
 *
 * `@RequireFeature` on the whole controller, the public read included: on a
 * stack where the feature is off both routes are 404, so the landing page
 * renders nothing rather than numbers a teacher never chose to show.
 *
 * The write is `admin/social-counts`, not `admin/settings/social-counts`:
 * `PATCH admin/settings/:section` would also match that path, and which of the
 * two answers would come down to controller registration order.
 */
@Controller()
@RequireFeature('socialCounts')
export class SocialCountsController {
  constructor(private readonly settings: SettingsService) {}

  /** Public: the landing page renders for visitors with no session. */
  @Public()
  @Throttle(PUBLIC_CONFIG_THROTTLE)
  @Get('settings/social-counts')
  read(): Promise<SocialCounts> {
    return this.settings.readSocialCounts();
  }

  /** Body validated in the service against `SocialCountsInputSchema` (strict). */
  @RequirePermission('settings:write')
  @Patch('admin/social-counts')
  update(@Body() body: unknown): Promise<SocialCounts> {
    return this.settings.updateSocialCounts(body);
  }
}
