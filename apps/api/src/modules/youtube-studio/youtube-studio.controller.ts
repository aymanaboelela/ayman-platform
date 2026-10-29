import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, seconds } from '@nestjs/throttler';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { ZodValidationPipe } from 'nestjs-zod';
import {
  MAX_YOUTUBE_THUMBNAIL_BYTES,
  type YoutubeConnectStart,
  type YoutubeStudioState,
  type YoutubeSuggestion,
  type YoutubeVideoDetail,
  type YoutubeVideoList,
} from '@ayman/contracts/youtube/studio';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { loadEnv } from '../../config/env';
import { YoutubeConnectionService } from './youtube-connection.service';
import { YoutubeSuggestRequestDto, YoutubeVideoUpdateDto } from './youtube-studio.dto';
import { YoutubeStudioService, type UploadFile } from './youtube-studio.service';

const UPLOAD = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: MAX_YOUTUBE_THUMBNAIL_BYTES, files: 1, fields: 0 },
});

/**
 * «اقترح لي» spends up to 250 YouTube quota units and one model call per
 * press. Three in a minute is a teacher trying again; more is a stuck finger.
 */
const SUGGEST_THROTTLE = {
  short: { limit: 1, ttl: seconds(5) },
  medium: { limit: 3, ttl: seconds(60) },
  long: { limit: 40, ttl: seconds(3600) },
};

/**
 * «يوتيوب» — `/api/admin/youtube/*`.
 *
 * Behind `youtubeStudio` (on for Ayman, 404 on any other stack until the owner
 * opens it) and the social studio's three permissions, for the same reasons:
 *
 *   · `social:read`    whether a channel is linked, the list, one video;
 *   · `social:write`   «اقترح لي» — it reads and writes nothing public;
 *   · `social:publish` anything that changes the PUBLIC channel (a save, a
 *                      thumbnail) and the OAuth grant itself, because whoever
 *                      may link a channel may edit it.
 *
 * ## The callback is NOT `@Public()`
 *
 * Google sends the browser back to `GET …/oauth/callback` as a top-level
 * navigation; the session cookie is `SameSite=Lax`, which a top-level GET
 * carries, so the admin's session arrives with it and the ordinary guard
 * stack applies. The `state` is then checked against THAT session's user id
 * (`oauth-state.ts`) — a callback finished in someone else's browser fails.
 */
@Controller('admin/youtube')
@RequireFeature('youtubeStudio')
@UsePipes(ZodValidationPipe)
export class YoutubeStudioController {
  private readonly appUrl = loadEnv(process.env).APP_URL.replace(/\/$/, '');

  constructor(
    private readonly connection: YoutubeConnectionService,
    private readonly studio: YoutubeStudioService,
  ) {}

  @RequirePermission('social:read')
  @Get()
  state(): Promise<YoutubeStudioState> {
    return this.connection.state();
  }

  @RequirePermission('social:publish')
  @Post('oauth/start')
  start(@CurrentUser() user: AuthenticatedUser): Promise<YoutubeConnectStart> {
    return this.connection.start(user.id);
  }

  @RequirePermission('social:publish')
  @Get('oauth/callback')
  async callback(
    @CurrentUser() user: AuthenticatedUser,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const outcome = await this.connection.complete(user.id, { code, state, error });
    // `?yt=` is one of six fixed words; nothing from the query is echoed back.
    response.redirect(303, `${this.appUrl}/admin/youtube?yt=${outcome}`);
  }

  @RequirePermission('social:publish')
  @Delete('connection')
  disconnect(): Promise<{ revoked: boolean }> {
    return this.connection.disconnect();
  }

  @RequirePermission('social:read')
  @Get('videos')
  list(@Query('pageToken') pageToken?: string): Promise<YoutubeVideoList> {
    return this.studio.list(pageToken?.trim() ? pageToken.trim() : null);
  }

  @RequirePermission('social:read')
  @Get('videos/:id')
  get(@Param('id') id: string): Promise<YoutubeVideoDetail> {
    return this.studio.get(id);
  }

  @RequirePermission('social:publish')
  @Patch('videos/:id')
  update(@Param('id') id: string, @Body() body: YoutubeVideoUpdateDto): Promise<YoutubeVideoDetail> {
    return this.studio.update(id, body);
  }

  @RequirePermission('social:publish')
  @Post('videos/:id/thumbnail')
  @UseInterceptors(UPLOAD)
  thumbnail(@Param('id') id: string, @UploadedFile() file?: UploadFile): Promise<YoutubeVideoDetail> {
    if (!file) throw new BadRequestException('no file uploaded');
    return this.studio.thumbnail(id, file);
  }

  @RequirePermission('social:write')
  @Post('videos/:id/handled')
  handled(@Param('id') id: string): Promise<{ ok: true }> {
    return this.studio.markHandled(id);
  }

  @RequirePermission('social:write')
  @Throttle(SUGGEST_THROTTLE)
  @Post('videos/:id/suggest')
  suggest(@Param('id') id: string, @Body() body: YoutubeSuggestRequestDto): Promise<YoutubeSuggestion> {
    return this.studio.suggest(id, body);
  }
}
