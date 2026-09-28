import { Controller, Get, Param, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { VideoKeyService } from './video-key.service';

/**
 * `GET /api/videos/:videoId/key` — the 16 bytes an encrypted lecture's
 * playlist points at. See `VideoKeyService` for who gets them.
 *
 * On the SITE's origin, so the player's request carries the student's cookie
 * with no CORS and no token in any URL. `private, no-store`: a key must never
 * be kept by the edge, by a shared cache, or in the browser's disk cache
 * where it would outlive the session that fetched it.
 */
@Controller()
export class VideoKeyController {
  constructor(private readonly keys: VideoKeyService) {}

  @RequirePermission('course:read')
  @Get('videos/:videoId/key')
  async key(
    @CurrentUser() user: AuthenticatedUser,
    @Param('videoId') videoId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const key = await this.keys.key(user, videoId);
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(key, { type: 'application/octet-stream', length: key.length });
  }
}
