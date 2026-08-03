import { Controller, Get, Query } from '@nestjs/common';
import type { ActivityFeed } from '@ayman/contracts/activity';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { ActivityService } from './activity.service';

/** One page of the feed. Bounded so a caller cannot ask for the whole history
 *  in one request — `?limit=100000` would issue three unbounded reads. */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * `GET /api/me/activity` — the student's own timeline.
 *
 * `@Controller('me')`, alongside `/api/me/dashboard` and `/api/me/quizzes`:
 * every route under that prefix answers "about the caller", takes no id
 * parameter, and derives identity from the session alone. That uniformity IS
 * the IDOR defence — there is nothing on the URL to tamper with.
 *
 * `progress:read` rather than `progress:write`: this is a read of finished
 * activity, and the write permission belongs to the heartbeat.
 */
@Controller('me')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @RequirePermission('progress:read')
  @Get('activity')
  feed(
    @CurrentUser() user: AuthenticatedUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<ActivityFeed> {
    return this.activity.forUser(user.id, clampLimit(limit), cursor);
  }
}

/**
 * `Number.parseInt` on junk yields `NaN`, and `Math.min(NaN, …)` is `NaN`,
 * which Prisma's `take` would reject at the driver with a 500. Every
 * non-numeric input lands on the default instead.
 */
function clampLimit(raw?: string): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}
