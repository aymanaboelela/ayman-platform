import { Controller, Get } from '@nestjs/common';
import type { Dashboard } from '@ayman/contracts';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { DashboardService } from './dashboard.service';

@Controller('me')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @RequirePermission('enrollment:read')
  @Get('dashboard')
  get(@CurrentUser() user: AuthenticatedUser): Promise<Dashboard> {
    // The only identity involved is the session's. There is no id parameter
    // to tamper with, which is the cheapest possible defence against IDOR.
    return this.dashboard.forUser(user.id);
  }
}
