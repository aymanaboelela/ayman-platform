import { Controller, Get, Param, Redirect } from '@nestjs/common';
import type { CourseOutline, LessonPlayer } from '@ayman/contracts';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PlayerService } from './player.service';

@Controller()
export class PlayerController {
  constructor(private readonly player: PlayerService) {}

  @RequirePermission('course:read')
  @Get('courses/:slug/outline')
  outline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
  ): Promise<CourseOutline> {
    return this.player.outline(user.id, slug);
  }

  @RequirePermission('course:read')
  @Get('lessons/:lessonId/player')
  lesson(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId') lessonId: string,
  ): Promise<LessonPlayer> {
    return this.player.lesson(user.id, lessonId);
  }

  /**
   * 302 rather than proxying the bytes: the app process should never sit in
   * the path of a 40MB PDF. The authorization decision still happens here, on
   * our origin, before the redirect is issued.
   */
  @RequirePermission('course:read')
  @Get('lessons/:lessonId/attachments/:attachmentId')
  @Redirect()
  async attachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId') lessonId: string,
    @Param('attachmentId') attachmentId: string,
  ): Promise<{ url: string; statusCode: number }> {
    return {
      url: await this.player.attachmentUrl(user.id, lessonId, attachmentId),
      statusCode: 302,
    };
  }
}
