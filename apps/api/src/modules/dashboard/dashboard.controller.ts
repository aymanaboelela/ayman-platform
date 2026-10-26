import { Controller, Get, NotFoundException } from '@nestjs/common';
import type { Dashboard } from '@ayman/contracts';
import type { StudentBacklog } from '@ayman/contracts/backlog';
import type { LearningPath, RetiredCourses } from '@ayman/contracts/path';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { IS_AYMAN } from '../../common/tenant';
import { BacklogService } from './backlog.service';
import { DashboardService } from './dashboard.service';
import { PathService } from './path.service';

@Controller('me')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly path: PathService,
    private readonly backlog: BacklogService,
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

  /**
   * «المتراكم عليّا» — Ayman's stack only (asked for that way). Every other
   * stack answers 404, the same as a route that does not exist, and has no
   * rail entry pointing here either.
   */
  @RequirePermission('enrollment:read')
  @Get('backlog')
  backlog_(@CurrentUser() user: AuthenticatedUser): Promise<StudentBacklog> {
    if (!IS_AYMAN) throw new NotFoundException();
    return this.backlog.forUser(user.id);
  }

  /** «الكورس ده خلص دوره في رحلتك» — the archived courses this student was in. */
  @RequirePermission('enrollment:read')
  @Get('retired-courses')
  retired(@CurrentUser() user: AuthenticatedUser): Promise<RetiredCourses> {
    return this.path.retiredFor(user.id);
  }
}
