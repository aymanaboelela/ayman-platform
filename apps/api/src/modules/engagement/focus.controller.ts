import { Body, Controller, Get, Post, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type { FocusPayload, FocusStopResult } from '@ayman/contracts/engagement';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { FocusStartDto } from './engagement.dto';
import { FocusService } from './focus.service';

/** «أوضة المذاكرة» — `enrollment:read`, behind `focusRoom`. */
@Controller('me/focus')
@RequireFeature('focusRoom')
@RequirePermission('enrollment:read')
export class FocusController {
  constructor(private readonly focus: FocusService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<FocusPayload> {
    return this.focus.forUser(user.id);
  }

  @Post('start')
  @UsePipes(ZodValidationPipe)
  start(@CurrentUser() user: AuthenticatedUser, @Body() dto: FocusStartDto): Promise<FocusPayload> {
    return this.focus.start(user.id, dto.minutes);
  }

  /** Whether the sitting counts as finished is decided here, from the clock. */
  @Post('stop')
  stop(@CurrentUser() user: AuthenticatedUser): Promise<FocusStopResult> {
    return this.focus.stop(user.id);
  }
}
