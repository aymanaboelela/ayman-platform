import { Body, Controller, Get, HttpCode, Put, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type { LeaguePayload, LeagueSummary } from '@ayman/contracts/engagement';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { LeagueSettingsDto } from './engagement.dto';
import { LeagueService } from './league.service';

/** «دوري الأسبوع» — `enrollment:read`, behind `weeklyLeague`. */
@Controller('me/league')
@RequireFeature('weeklyLeague')
@RequirePermission('enrollment:read')
export class LeagueController {
  constructor(private readonly league: LeagueService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<LeaguePayload> {
    return this.league.forUser(user.id);
  }

  /** The reader's place only, for «النهارده» on the dashboard. */
  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser): Promise<LeagueSummary> {
    return this.league.summary(user.id);
  }

  /** Hide the name and photo from everyone else's table. */
  @Put('settings')
  @HttpCode(204)
  @UsePipes(ZodValidationPipe)
  settings(@CurrentUser() user: AuthenticatedUser, @Body() dto: LeagueSettingsDto): Promise<void> {
    return this.league.setHidden(user.id, dto.hidden);
  }
}
