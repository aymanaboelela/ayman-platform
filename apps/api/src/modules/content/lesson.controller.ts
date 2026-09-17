import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { copy } from '@ayman/contracts/copy/admin';
import { extractYouTubeId, type VideoEmbedStatus } from '@ayman/contracts/video';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { LessonService } from './lesson.service';
import { VideoUploadService } from '../video-mirror/video-upload.service';
import { YouTubeDurationService } from './youtube-duration.service';
import { SetHomeworkDto } from '../homework/homework.dto';
import {
  AddResourceDto,
  CreateLessonDto,
  ReorderDto,
  SetLessonTextDto,
  AbortVideoUploadDto,
  CompleteVideoUploadDto,
  SetLessonVideoDto,
  StartVideoUploadDto,
  UpdateLessonDto,
  UpdateResourceDto,
} from './dto/lesson.dto';

@Controller('admin')
@UsePipes(ZodValidationPipe)
export class LessonController {
  constructor(
    private readonly lessons: LessonService,
    private readonly youtube: YouTubeDurationService,
    private readonly uploads: VideoUploadService,
  ) {}

  /**
   * What the admin form shows under the link the moment it is pasted, so the
   * duration is visible BEFORE saving rather than appearing afterwards.
   *
   * The same probe `setVideo` runs, exposed so the browser can trigger it
   * early — behind `lesson:write`, because an open endpoint that fetches a URL
   * on request is a proxy, however narrow the allowlist. A video that will not
   * answer returns 200 with `null`: "we asked and it said nothing" is an
   * answer, not an error.
   *
   * It also reports whether YouTube will EMBED the video, which the duration
   * alone cannot tell you — the watch page answers for videos the embed player
   * refuses, so a video with «السماح بالتضمين» switched off used to save with a
   * correct duration and then fail at the student's first tap. Same fetch, so
   * the check is free; the route keeps its name because the duration is still
   * what the field is waiting on.
   *
   * ⚠️ Two path segments, so it cannot be captured by any `lessons/:id/…`
   * route; it is declared before them anyway, since Nest matches in order.
   */
  @RequirePermission('lesson:write')
  @Get('lessons/video-duration')
  async videoDuration(
    @Query('url') url?: string,
  ): Promise<{ durationSeconds: number | null; embed: VideoEmbedStatus }> {
    const externalId = extractYouTubeId(url ?? '');
    if (externalId === null) throw new BadRequestException(copy.admin.lesson.videoUrlInvalid);
    return this.youtube.probe(externalId);
  }

  /**
   * ⚠️ Nest matches routes in declaration order. This has to be declared
   * before `sections/:sectionId/lessons` (POST is a different method so it
   * cannot collide) but, more importantly, before any future
   * `sections/:sectionId/lessons/:id`-shaped route — otherwise `order` would
   * be captured as an `:id` param. There is no such route in this plan.
   */
  @RequirePermission('lesson:reorder')
  @Patch('sections/:sectionId/lessons/order')
  reorder(@Param('sectionId') sectionId: string, @Body() body: ReorderDto) {
    return this.lessons.reorder(sectionId, body.orderedIds);
  }

  @RequirePermission('lesson:write')
  @Post('sections/:sectionId/lessons')
  create(@Param('sectionId') sectionId: string, @Body() body: CreateLessonDto) {
    return this.lessons.create(sectionId, body);
  }

  @RequirePermission('lesson:write')
  @Patch('lessons/:id')
  update(@Param('id') id: string, @Body() body: UpdateLessonDto) {
    return this.lessons.update(id, body);
  }

  @RequirePermission('lesson:write')
  @Delete('lessons/:id')
  remove(@Param('id') id: string) {
    return this.lessons.remove(id);
  }

  /** The body arrives as `{provider, url, ...}` and lands here as `{provider, externalId, ...}`. */
  @RequirePermission('lesson:write')
  @Put('lessons/:id/video')
  setVideo(@Param('id') id: string, @Body() body: SetLessonVideoDto) {
    return this.lessons.setVideo(id, body);
  }

  @RequirePermission('lesson:write')
  @Delete('lessons/:id/video')
  removeVideo(@Param('id') id: string) {
    return this.lessons.removeVideo(id);
  }

  /**
   * «حاول تاني» — put this lecture's video back in the mirror queue.
   *
   * The worker gives up after three consecutive failures, which is right: the
   * failures that clear on a retry clear on the second one, and a video
   * YouTube has deleted will not come back on the fiftieth. But "gives up"
   * without a way back means a single bad night leaves a lecture permanently
   * unwatchable on ministry tablets, fixable only by someone with a psql
   * prompt. This is that way back.
   *
   * `lesson:write` and not a new permission: the person who may replace the
   * video may certainly ask for it to be copied again.
   */
  @RequirePermission('lesson:write')
  @Post('lessons/:id/video/mirror')
  remirrorVideo(@Param('id') id: string) {
    return this.lessons.remirrorVideo(id);
  }

  /* ── الرفع المباشر ───────────────────────────────────────────────────────
   *
   * Three endpoints, and not one of them carries a video byte. The browser is
   * handed pre-signed URLs and sends the parts straight to the bucket; these
   * open the session, seal it, and cancel it.
   *
   * All on `lesson:write` — the same permission as pasting a YouTube link,
   * because it is the same act. A separate permission would mean a role that
   * can replace a lecture with a link but not with a file, which describes
   * nobody.
   */
  @RequirePermission('lesson:write')
  @Post('lessons/:id/video/upload')
  startVideoUpload(@Param('id') id: string, @Body() body: StartVideoUploadDto) {
    return this.uploads.start(id, body);
  }

  @RequirePermission('lesson:write')
  @Post('lessons/:id/video/upload/complete')
  completeVideoUpload(@Param('id') id: string, @Body() body: CompleteVideoUploadDto) {
    return this.uploads.complete(id, body);
  }

  @RequirePermission('lesson:write')
  @Post('lessons/:id/video/upload/abort')
  abortVideoUpload(@Param('id') id: string, @Body() body: AbortVideoUploadDto) {
    return this.uploads.abort(id, body);
  }

  /**
   * Polled by the admin screen while the encode runs.
   *
   * A read, so `lesson:read` would be defensible — but it reports the encoder
   * error verbatim, which is a server-side diagnostic, and it is only ever
   * called by the screen that just started the upload. `lesson:write` costs
   * nothing here and keeps the diagnostic with the people who can act on it.
   */
  @RequirePermission('lesson:write')
  @Get('lessons/:id/video/upload/status')
  videoUploadStatus(@Param('id') id: string) {
    return this.uploads.status(id);
  }

  @RequirePermission('lesson:write')
  @Put('lessons/:id/text')
  setText(@Param('id') id: string, @Body() body: SetLessonTextDto) {
    return this.lessons.setText(id, body);
  }

  /**
   * الواجب — the exercise on this lecture, and «شيل الواجب».
   *
   * `lesson:write`, not a `homework:*` permission: this is authoring the
   * lecture's own content, exactly like its text or its materials. The
   * `homework:*` pair governs reading and DECIDING what students hand back,
   * which is a different act by a possibly different person — see the
   * permission catalogue's own note.
   */
  @RequirePermission('lesson:write')
  @Put('lessons/:id/homework')
  setHomework(@Param('id') id: string, @Body() body: SetHomeworkDto) {
    return this.lessons.setHomework(id, body);
  }

  @RequirePermission('lesson:write')
  @Delete('lessons/:id/homework')
  removeHomework(@Param('id') id: string) {
    return this.lessons.removeHomework(id);
  }

  /**
   * ⚠️ Declared BEFORE `lessons/:id/resources` for the same reason
   * `sections/:sectionId/lessons/order` leads that group: Nest matches in
   * declaration order, and a later `lessons/:id/resources/:resourceId` route
   * would otherwise capture `order` as a resource id.
   */
  @RequirePermission('lesson:reorder')
  @Patch('lessons/:id/resources/order')
  reorderResources(@Param('id') id: string, @Body() body: ReorderDto) {
    return this.lessons.reorderResources(id, body.orderedIds);
  }

  @RequirePermission('lesson:write')
  @Post('lessons/:id/resources')
  addResource(@Param('id') id: string, @Body() body: AddResourceDto) {
    return this.lessons.addResource(id, body);
  }

  @RequirePermission('lesson:write')
  @Patch('resources/:id')
  updateResource(@Param('id') id: string, @Body() body: UpdateResourceDto) {
    return this.lessons.updateResource(id, body);
  }

  @RequirePermission('lesson:write')
  @Delete('resources/:id')
  removeResource(@Param('id') id: string) {
    return this.lessons.removeResource(id);
  }
}
