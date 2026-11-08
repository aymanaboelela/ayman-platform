import { Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res, UsePipes } from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { OUTPUT_MIME } from '@ayman/contracts/admin/media';
import type {
  AdminReservation,
  AdminReservations,
  CenterManager,
  ReservationSettings,
  ReservationSetup,
} from '@ayman/contracts/center-reservations';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { MediaService } from '../media/media.service';
import { RequireCsrf } from '../security/require-csrf.decorator';
import {
  AdminReservationsQueryDto,
  CenterManagerCreateDto,
  CenterManagerPasswordDto,
  ReservationCenterPatchDto,
  ReservationReviewDto,
  ReservationSettingsDto,
} from './center-reservations.dto';
import { CenterReservationsService } from './center-reservations.service';

/**
 * «حجوزات السناتر» on the dashboard. `center:read` to look (the same people
 * who read the centres' attendance and money), `center:write` for every
 * decision — confirming a payment, the page's switches, and the centre owners'
 * logins.
 *
 * ⚠️ Literal segments (`setup`, `settings`, `centers`, `managers`) are
 * declared before any `:id` route so none of them is swallowed.
 */
@RequireFeature('centerReservations')
@Controller('admin/center-reservations')
@UsePipes(ZodValidationPipe)
export class AdminCenterReservationsController {
  constructor(
    private readonly reservations: CenterReservationsService,
    private readonly media: MediaService,
  ) {}

  @RequirePermission('center:read')
  @Get()
  list(@Query() query: AdminReservationsQueryDto): Promise<AdminReservations> {
    return this.reservations.adminList(query as never);
  }

  @RequirePermission('center:read')
  @Get('setup')
  setup(): Promise<ReservationSetup> {
    return this.reservations.setup();
  }

  @RequirePermission('center:write')
  @RequireCsrf()
  @Put('settings')
  writeSettings(@Body() body: ReservationSettingsDto, @CurrentUser() user: AuthenticatedUser): Promise<ReservationSettings> {
    return this.reservations.writeSettings(user.id, body as ReservationSettings);
  }

  @RequirePermission('center:write')
  @RequireCsrf()
  @Patch('centers/:centerId')
  patchCenter(
    @Param('centerId', ParseUUIDPipe) centerId: string,
    @Body() body: ReservationCenterPatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReservationSetup> {
    return this.reservations.patchCenter(user.id, centerId, body as never);
  }

  @RequirePermission('center:write')
  @RequireCsrf()
  @Post('managers')
  createManager(@Body() body: CenterManagerCreateDto, @CurrentUser() user: AuthenticatedUser): Promise<CenterManager[]> {
    return this.reservations.createManager(user.id, body as never);
  }

  @RequirePermission('center:write')
  @RequireCsrf()
  @Post('managers/:userId/password')
  setManagerPassword(
    @Param('userId') userId: string,
    @Body() body: CenterManagerPasswordDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CenterManager[]> {
    return this.reservations.setManagerPassword(user.id, userId, body.password);
  }

  @RequirePermission('center:write')
  @RequireCsrf()
  @Post('managers/:userId/disable')
  disableManager(@Param('userId') userId: string, @CurrentUser() user: AuthenticatedUser): Promise<CenterManager[]> {
    return this.reservations.setManagerDisabled(user.id, userId, true);
  }

  @RequirePermission('center:write')
  @RequireCsrf()
  @Post('managers/:userId/enable')
  enableManager(@Param('userId') userId: string, @CurrentUser() user: AuthenticatedUser): Promise<CenterManager[]> {
    return this.reservations.setManagerDisabled(user.id, userId, false);
  }

  /** The proof-of-payment screenshot — gated by permission, never by an unguessable key. */
  @RequirePermission('center:read')
  @Get(':id/screenshot')
  async screenshot(@Param('id', ParseUUIDPipe) id: string, @Res() response: Response): Promise<void> {
    await streamScreenshot(this.media, await this.reservations.screenshotKeyFor(id), response);
  }

  @RequirePermission('center:write')
  @RequireCsrf()
  @Post(':id/review')
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReservationReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminReservation> {
    return this.reservations.review(user.id, id, body.action, body.reason);
  }

  @RequirePermission('center:write')
  @RequireCsrf()
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<{ ok: true }> {
    return this.reservations.remove(user.id, id);
  }
}

/** `AdminBookOrdersController.screenshot`'s headers: our own re-encoded bytes, sandboxed. */
export async function streamScreenshot(media: MediaService, key: string, response: Response): Promise<void> {
  const info = await media.statByKey(key);
  if (!info) throw new NotFoundException();
  response.set({
    'Content-Type': OUTPUT_MIME,
    'Content-Length': String(info.size),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  (await media.streamByKey(key)).pipe(response);
}
