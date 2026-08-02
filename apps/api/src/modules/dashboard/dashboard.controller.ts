import { Controller, Get } from '@nestjs/common';
import type { Dashboard } from '@ayman/contracts';
import type { LearningPath } from '@ayman/contracts/path';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { DashboardService } from './dashboard.service';
import { PathService } from './path.service';

@Controller('me')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly path: PathService,
  ) {}

  @RequirePermission('enrollment:read')
  @Get('dashboard')
  get(@CurrentUser() user: AuthenticatedUser): Promise<Dashboard> {
    // The only identity involved is the session's. There is no id parameter
    // to tamper with, which is the cheapest possible defence against IDOR.
    return this.dashboard.forUser(user.id);
  }

  /**
   * The learning-path map. Same identity discipline as `dashboard` above:
   * there is no id parameter to tamper with, and the lock states come from the
   * resolver the lesson routes enforce rather than from a second computation.
   */
  @RequirePermission('enrollment:read')
  @Get('path')
  path_(@CurrentUser() user: AuthenticatedUser): Promise<LearningPath> {
    return this.path.forUser(user.id);
  }
}
