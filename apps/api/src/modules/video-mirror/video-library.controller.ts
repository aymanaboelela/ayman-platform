import { Body, Controller, Delete, Get, Param, Post, UsePipes } from '@nestjs/common';
import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { VideoAttachSchema, VideoRestoreSchema } from '@ayman/contracts/admin/video-upload';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { VideoLibraryService } from './video-library.service';

/**
 * «الفيديوهات» — see `VideoLibraryService`.
 *
 * Behind `video.upload` like the upload routes: a stack that cannot upload has
 * nothing here, and the route answers 404 rather than an empty list that would
 * read as «مفيش فيديوهات».
 *
 * Listing is `course:read-admin`, NOT `course:read` — the latter is a STUDENT
 * permission (the player holds it), and this list names draft lessons in
 * unpublished courses and what each costs. Deleting is
 * `lesson:write`, the same as removing a video from its lesson, because for a
 * video a lesson uses it IS that act, plus the bytes.
 */
class VideoRestoreDto extends createZodDto(VideoRestoreSchema) {}
class VideoAttachDto extends createZodDto(VideoAttachSchema) {}

@Controller('admin')
@UsePipes(ZodValidationPipe)
export class VideoLibraryController {
  constructor(private readonly library: VideoLibraryService) {}

  @RequireFeature('video.upload')
  @RequirePermission('course:read-admin')
  @Get('videos')
  list() {
    return this.library.list();
  }

  /** «رجّعه لمحاضرة» — a kept video back on a lesson. `lesson:write`, like putting any video on one. */
  @RequireFeature('video.upload')
  @RequirePermission('lesson:write')
  @Post('videos/:videoId/restore')
  restore(@Param('videoId') videoId: string, @Body() body: VideoRestoreDto) {
    return this.library.restore(videoId, body.lessonId);
  }

  /**
   * «اختار فيديو متروفع قبل كده» — the picker in the lesson panel. Same
   * permission as the library list: it names lessons in draft courses.
   */
  @RequireFeature('video.upload')
  @RequirePermission('course:read-admin')
  @Get('videos/reusable')
  reusable() {
    return this.library.reusable();
  }

  /** Point one more lesson at a video already in the bucket. `lesson:write`, like `restore`. */
  @RequireFeature('video.upload')
  @RequirePermission('lesson:write')
  @Post('videos/:videoId/attach')
  attach(@Param('videoId') videoId: string, @Body() body: VideoAttachDto) {
    return this.library.attach(videoId, body.lessonId);
  }

  @RequireFeature('video.upload')
  @RequirePermission('lesson:write')
  @Delete('videos/:videoId')
  remove(@Param('videoId') videoId: string) {
    return this.library.remove(videoId);
  }
}
