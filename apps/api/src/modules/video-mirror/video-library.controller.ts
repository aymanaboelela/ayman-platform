import { Controller, Delete, Get, Param } from '@nestjs/common';
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
@Controller('admin')
export class VideoLibraryController {
  constructor(private readonly library: VideoLibraryService) {}

  @RequireFeature('video.upload')
  @RequirePermission('course:read-admin')
  @Get('videos')
  list() {
    return this.library.list();
  }

  @RequireFeature('video.upload')
  @RequirePermission('lesson:write')
  @Delete('videos/:videoId')
  remove(@Param('videoId') videoId: string) {
    return this.library.remove(videoId);
  }
}
