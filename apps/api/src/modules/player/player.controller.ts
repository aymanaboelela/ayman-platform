import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
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
   * ⚠️ This replaces a 302 to the media origin, and the change is deliberate.
   *
   * That redirect reasoned "the app process should never sit in the path of a
   * 40MB PDF" — true of CPU and memory, but it sent the student to
   * `GET /media/:prefix/:name`, which is `@Public()`. The authorization
   * happened once, to MINT the URL; the URL itself then worked forever, for
   * anyone, with no session. For a course cover that is fine. For a deck behind
   * an enrollment it means the gate can be walked around by pasting a link.
   *
   * The bytes are STREAMED, not buffered: `getStream().pipe(response)` moves
   * them through with backpressure, so the cost of the change is a held
   * connection rather than a 200MB allocation.
   *
   * `inline` renders in the viewer's iframe, `attachment` downloads. Identical
   * authorization, identical headers, one differing word — which is why they
   * share `serveResource`.
   */
  private async serveResource(
    userId: string,
    lessonId: string,
    resourceId: string,
    disposition: 'inline' | 'attachment',
    response: Response,
  ): Promise<void> {
    const file = await this.player.resourceStream(userId, lessonId, resourceId);

    response.set({
      // Our detected mime, never one the uploader declared.
      'Content-Type': file.mime,
      'Content-Length': String(file.size),
      'X-Content-Type-Options': 'nosniff',
      // RFC 5987. These filenames are Arabic more often than not, and a raw
      // non-ASCII byte in a header is a malformed response, not a filename.
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      // A shared-machine browser cache holding an enrollment-gated deck
      // outlives the session that was allowed to read it.
      'Cache-Control': 'private, no-store',
      // What makes framing this on our own origin safe: a unique opaque origin
      // with no script execution, whatever the file turns out to contain.
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });

    file.stream.pipe(response);
  }

  @RequirePermission('course:read')
  @Get('lessons/:lessonId/resources/:resourceId/view')
  view(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId') lessonId: string,
    @Param('resourceId') resourceId: string,
    @Res() response: Response,
  ): Promise<void> {
    return this.serveResource(user.id, lessonId, resourceId, 'inline', response);
  }

  @RequirePermission('course:read')
  @Get('lessons/:lessonId/resources/:resourceId/download')
  download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId') lessonId: string,
    @Param('resourceId') resourceId: string,
    @Res() response: Response,
  ): Promise<void> {
    return this.serveResource(user.id, lessonId, resourceId, 'attachment', response);
  }
}
