import { Controller, Get, Headers, NotFoundException, Param, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import {
  isLegacyNativeHlsClient,
  VIDEO_KEY_NONCE_HEADER,
  VIDEO_KEY_NONCE_RE,
} from '@ayman/contracts/video';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { userHasPermission } from '../../auth/permissions';
import { maskVideoKey } from '../video-mirror/video-key';
import { VideoKeyService } from './video-key.service';
import { VideoKeyWatchService } from './video-key-watch.service';

/**
 * `GET /api/videos/:videoId/key` — the 16 bytes an encrypted lecture's
 * playlist points at. See `VideoKeyService` for who gets them.
 *
 * On the SITE's origin, so the player's request carries the student's cookie
 * with no CORS and no token in any URL. `private, no-store`: a key must never
 * be kept by the edge, by a shared cache, or in the browser's disk cache
 * where it would outlive the session that fetched it.
 *
 * ## HOW they get them — wrapped, for our player only
 *
 * With a nonce in `VIDEO_KEY_NONCE_HEADER` the answer is the key XORed with a
 * mask of that nonce (`maskVideoKey`) — what our hls.js loader asks for. With
 * no nonce, only an iPhone gets the plain key (`isLegacyNativeHlsClient`);
 * anyone else gets the same 404 a stranger does, BEFORE any database work, so
 * a downloader handed the playlist and a cookie learns nothing — not even
 * whether it was entitled. Every key handed out is counted by
 * `VideoKeyWatchService` (rate ceiling + the admins' burst alert); staff
 * previewing a course are not counted.
 */
@Controller()
export class VideoKeyController {
  constructor(
    private readonly keys: VideoKeyService,
    private readonly watch: VideoKeyWatchService,
  ) {}

  @RequirePermission('course:read')
  @Get('videos/:videoId/key')
  async key(
    @CurrentUser() user: AuthenticatedUser,
    @Param('videoId') videoId: string,
    @Headers(VIDEO_KEY_NONCE_HEADER) nonceHeader: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const nonce = nonceHeader !== undefined && VIDEO_KEY_NONCE_RE.test(nonceHeader) ? nonceHeader : null;
    if (nonce === null && !isLegacyNativeHlsClient(userAgent)) throw new NotFoundException('video not found');

    const raw = await this.keys.key(user, videoId);
    if (!userHasPermission(user.id, user.role, 'course:read-admin')) {
      await this.watch.admit(user.id, videoId);
    }
    const key = nonce === null ? raw : maskVideoKey(raw, videoId, nonce);
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(key, { type: 'application/octet-stream', length: key.length });
  }
}
