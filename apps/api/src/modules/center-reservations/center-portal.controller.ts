import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { CenterPortal } from '@ayman/contracts/center-reservations';
import { userHasPermission } from '../../auth/permissions';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { MediaService } from '../media/media.service';
import { streamScreenshot } from './admin-center-reservations.controller';
import { CenterReservationsService } from './center-reservations.service';

/**
 * «لوحة السنتر» — a centre owner's whole API: their own centre's
 * reservations and the screenshots on them. Read-only.
 *
 * `center-portal:read` is self-scoped: the centre comes from the caller's own
 * `center_managers` row, never from the request. The one exception is
 * `?centerId=` for someone who already holds `center:read` (every centre's
 * data) — that is the dashboard's «لوحة السنتر» preview, not a widening.
 */
@RequireFeature('centerReservations')
@Controller('center-portal')
export class CenterPortalController {
  constructor(
    private readonly reservations: CenterReservationsService,
    private readonly media: MediaService,
  ) {}

  @RequirePermission('center-portal:read')
  @Get()
  async portal(@CurrentUser() user: AuthenticatedUser, @Query('centerId') centerId?: string): Promise<CenterPortal> {
    return this.reservations.portal(await this.centerFor(user, centerId));
  }

  @RequirePermission('center-portal:read')
  @Get('reservations/:id/screenshot')
  async screenshot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
    @Query('centerId') centerId?: string,
  ): Promise<void> {
    const key = await this.reservations.screenshotKeyFor(id, await this.centerFor(user, centerId));
    await streamScreenshot(this.media, key, response);
  }

  private centerFor(user: AuthenticatedUser, centerId?: string): Promise<string> {
    const preview = centerId && /^[0-9a-f-]{36}$/i.test(centerId) && userHasPermission(user.id, user.role, 'center:read') ? centerId : undefined;
    return this.reservations.portalCenterId(user.id, preview);
  }
}
