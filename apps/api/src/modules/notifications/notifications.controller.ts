import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type { NotificationFeed, UnreadCount } from '@ayman/contracts/notifications';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { NotificationsService } from './notifications.service';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * `/api/me/notifications` — the student's own.
 *
 * Same prefix and the same identity discipline as `/api/me/dashboard`,
 * `/api/me/quizzes` and `/api/me/activity`: the read routes take no id
 * parameter at all, and the one route that does (`:id/read`) is scoped by
 * `{ id, userId }` inside `updateMany`, so a guessed id belonging to another
 * student updates zero rows instead of theirs.
 *
 * `profile:read` is the permission — every signed-in student holds it, and
 * notifications are personal rather than course content. Deliberately not
 * `quiz:read`, even though two of the three kinds come from the quiz engine:
 * the notification list is about the caller, not about a quiz.
 */
@Controller('me')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @RequirePermission('profile:read')
  @Get('notifications')
  feed(
    @CurrentUser() user: AuthenticatedUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<NotificationFeed> {
    return this.notifications.feed(user.id, clampLimit(limit), cursor);
  }

  /**
   * Its own route rather than a field on the feed: the topbar renders this on
   * every page and must not fetch twenty rows to show one number.
   */
  @RequirePermission('profile:read')
  @Get('notifications/unread-count')
  async unread(@CurrentUser() user: AuthenticatedUser): Promise<UnreadCount> {
    return { unread: await this.notifications.unreadCount(user.id) };
  }

  /**
   * 204, not 200 with a body. There is nothing useful to return — the caller
   * already knows which notification it marked — and an empty 200 invites a
   * client to start depending on a shape that does not exist.
   *
   * Idempotent: marking an already-read notification does not move its
   * timestamp, so "when did I read this" stays true across a double-click or a
   * retried request.
   */
  @RequirePermission('profile:write')
  @Post('notifications/:id/read')
  @HttpCode(204)
  async read(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.notifications.markRead(user.id, id);
  }

  @RequirePermission('profile:write')
  @Post('notifications/read-all')
  @HttpCode(204)
  async readAll(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.notifications.markAllRead(user.id);
  }
}

/**
 * `Number.parseInt` on junk is `NaN`, and `Math.min(NaN, …)` is `NaN`, which
 * Prisma's `take` rejects at the driver as a 500. Every non-numeric input
 * lands on the default instead.
 */
function clampLimit(raw?: string): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}
