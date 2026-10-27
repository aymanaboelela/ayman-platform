import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, seconds } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { ZodValidationPipe } from 'nestjs-zod';
import {
  MAX_SOCIAL_IMAGE_BYTES,
  SocialPostListQuerySchema,
  type SocialConnection,
  type SocialConnectionTest,
  type SocialPost,
  type SocialPostList,
  type SocialScanResult,
} from '@ayman/contracts/social/posts';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { parseRequest } from '../../common/http/parse-request';
import { SocialConnectionService } from './social-connection.service';
import { SocialConnectionWriteDto, SocialMarkPublishedDto, SocialPostPatchDto } from './social-posts.dto';
import { SocialPostsService, type UploadFile } from './social-posts.service';

const UPLOAD = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: MAX_SOCIAL_IMAGE_BYTES, files: 1, fields: 0 },
});

/** A scan walks six sources; pressing the button ten times in a row helps nobody. */
const SCAN_THROTTLE = {
  short: { limit: 1, ttl: seconds(2) },
  medium: { limit: 10, ttl: seconds(60) },
  long: { limit: 200, ttl: seconds(3600) },
};

/**
 * «استوديو البوستات» — `/api/admin/social/*`.
 *
 * Behind `socialPosts` (on for Ayman, 404 on any other stack until the owner
 * opens it from `/admin/platforms`), and three permissions:
 *
 *   · `social:read`    the inbox, the calendar, whether accounts are linked;
 *   · `social:write`   captions, schedules, skipping, the rendered picture,
 *                      «تدوير على الجديد»;
 *   · `social:publish` anything that puts a post on the Page — the Graph
 *                      publish, marking a manual post, and the Page token
 *                      itself, because whoever may set it may post as the Page.
 */
@Controller('admin/social')
@RequireFeature('socialPosts')
@UsePipes(ZodValidationPipe)
export class SocialPostsController {
  constructor(
    private readonly posts: SocialPostsService,
    private readonly connection: SocialConnectionService,
  ) {}

  @RequirePermission('social:read')
  @Get('posts')
  list(@Query('from') from?: string, @Query('to') to?: string): Promise<SocialPostList> {
    return this.posts.list(parseRequest(SocialPostListQuerySchema, { from, to }, 'social posts query'));
  }

  @RequirePermission('social:read')
  @Get('posts/:id')
  get(@Param('id') id: string): Promise<SocialPost> {
    return this.posts.get(id);
  }

  @RequirePermission('social:write')
  @Throttle(SCAN_THROTTLE)
  @Post('scan')
  scan(): Promise<SocialScanResult> {
    return this.posts.scan();
  }

  @RequirePermission('social:write')
  @Patch('posts/:id')
  patch(@Param('id') id: string, @Body() body: SocialPostPatchDto): Promise<SocialPost> {
    return this.posts.patch(id, body);
  }

  @RequirePermission('social:write')
  @Post('posts/:id/image')
  @UseInterceptors(UPLOAD)
  uploadImage(
    @Param('id') id: string,
    @Query('format') format: string | undefined,
    @UploadedFile() file?: UploadFile,
  ): Promise<SocialPost> {
    if (!file) throw new BadRequestException('no file uploaded');
    return this.posts.uploadImage(id, format ?? '', file);
  }

  @RequirePermission('social:publish')
  @Post('posts/:id/publish')
  publish(@Param('id') id: string): Promise<SocialPost> {
    return this.posts.publish(id);
  }

  @RequirePermission('social:publish')
  @Post('posts/:id/mark-published')
  markPublished(@Param('id') id: string, @Body() body: SocialMarkPublishedDto): Promise<SocialPost> {
    return this.posts.markPublished(id, body);
  }

  @RequirePermission('social:read')
  @Get('connection')
  readConnection(): Promise<SocialConnection> {
    return this.connection.read();
  }

  @RequirePermission('social:publish')
  @Put('connection')
  writeConnection(@Body() body: SocialConnectionWriteDto): Promise<SocialConnection> {
    return this.connection.write(body);
  }

  @RequirePermission('social:publish')
  @Post('connection/test')
  testConnection(): Promise<SocialConnectionTest> {
    return this.connection.test();
  }
}
