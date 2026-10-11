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
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { LessonService } from './lesson.service';
import { VideoUploadService } from '../video-mirror/video-upload.service';
import { ResourceVideoUploadService } from '../video-mirror/resource-video-upload.service';
import { YouTubeDurationService } from './youtube-duration.service';
import { SetHomeworkDto } from '../homework/homework.dto';
import {
  AddResourceDto,
  CreateLessonDto,
  ReorderDto,
  SetLessonTextDto,
  AbortVideoUploadDto,
  CompleteVideoUploadDto,
  ResumeVideoUploadDto,
  SetVideoPosterDto,
  SetVideoTrimDto,
  SetLessonVideoDto,
  StartResourceVideoUploadDto,
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
    private readonly resourceUploads: ResourceVideoUploadService,
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

  /**
   * «الصورة اللي أنا حاطّاها» on an UPLOADED lecture. The YouTube save carries
   * its poster in the same PUT as the URL; an upload has no URL to re-send, and
   * `PUT …/video` refuses `provider: 'upload'` — so the poster had no door.
   */
  @RequireFeature('video.upload')
  @RequirePermission('lesson:write')
  @Put('lessons/:id/video/poster')
  setVideoPoster(@Param('id') id: string, @Body() body: SetVideoPosterDto) {
    return this.lessons.setUploadPoster(id, body.posterKey);
  }

  /** «قص الفيديو» — the player applies it; the files are never touched. */
  @RequireFeature('video.upload')
  @RequirePermission('lesson:write')
  @Put('lessons/:id/video/trim')
  setVideoTrim(@Param('id') id: string, @Body() body: SetVideoTrimDto) {
    return this.lessons.setTrim(id, body.trim);
  }

  /** `?keep=false` deletes an uploaded video's files; anything else keeps them in «محفوظة». */
  @RequirePermission('lesson:write')
  @Delete('lessons/:id/video')
  removeVideo(@Param('id') id: string, @Query('keep') keep?: string) {
    return this.lessons.removeVideo(id, keep !== 'false');
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
   *
   * وكلهم على `video.upload` كمان — وهي الفيتشر اللي بتكلّف فلوس: البايتات
   * بتقعد على R2 بتاعنا وبتتعاد مرة تانية في الإنكودينج. عشان كده افتراضيها
   * مقفول على أي ستاك مش بتاع أيمن (شوف `defaultForTenant` في الكتالوج).
   *
   * ⚠️ `POST lessons/:id/video/mirror` فوق **مش** منهم عن قصد. ده بينسخ
   * فيديو يوتيوب على R2 عشان التابلت اللي بيحجب يوتيوب — بيشتغل لمحاضرة
   * مالهاش أي علاقة بالرفع المباشر، وقفله بيكسر تشغيل محاضرات يوتيوب.
   */
  @RequireFeature('video.upload')
  @RequirePermission('lesson:write')
  @Post('lessons/:id/video/upload')
  startVideoUpload(@Param('id') id: string, @Body() body: StartVideoUploadDto) {
    return this.uploads.start(id, body);
  }

  @RequireFeature('video.upload')
  @RequirePermission('lesson:write')
  @Post('lessons/:id/video/upload/complete')
  completeVideoUpload(@Param('id') id: string, @Body() body: CompleteVideoUploadDto) {
    return this.uploads.complete(id, body);
  }

  @RequireFeature('video.upload')
  @RequirePermission('lesson:write')
  @Post('lessons/:id/video/upload/resume')
  resumeVideoUpload(@Param('id') id: string, @Body() body: ResumeVideoUploadDto) {
    return this.uploads.resume(id, body);
  }

  @RequireFeature('video.upload')
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
  @RequireFeature('video.upload')
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

  /* ── «رفع فيديو» جوّه مواد الدرس ──────────────────────────────────────
   *
   * The lecture's upload routes, for a MATERIAL — see
   * `ResourceVideoUploadService`. `lesson:write` like every other material
   * write, and `video.upload` like the lecture's upload, because it is the
   * same cost: the bytes sit on R2 and are encoded again. A stack with the
   * feature off keeps «رابط يوتيوب» for materials and loses nothing else.
   *
   * `start` hangs off the LESSON (the material does not exist yet); the rest
   * off the material it created.
   */
  @RequireFeature('video.upload')
  @RequirePermission('lesson:write')
  @Post('lessons/:id/resources/video-upload')
  startResourceVideoUpload(@Param('id') id: string, @Body() body: StartResourceVideoUploadDto) {
    return this.resourceUploads.start(id, body);
  }

  @RequireFeature('video.upload')
  @RequirePermission('lesson:write')
  @Post('resources/:id/video-upload/complete')
  completeResourceVideoUpload(@Param('id') id: string, @Body() body: CompleteVideoUploadDto) {
    return this.resourceUploads.complete(id, body);
  }

  @RequireFeature('video.upload')
  @RequirePermission('lesson:write')
  @Post('resources/:id/video-upload/resume')
  resumeResourceVideoUpload(@Param('id') id: string, @Body() body: ResumeVideoUploadDto) {
    return this.resourceUploads.resume(id, body);
  }

  @RequireFeature('video.upload')
  @RequirePermission('lesson:write')
  @Post('resources/:id/video-upload/abort')
  abortResourceVideoUpload(@Param('id') id: string, @Body() body: AbortVideoUploadDto) {
    return this.resourceUploads.abort(id, body);
  }

  /** Polled while the encoder works. `lesson:write` for the same reason as the lecture's status. */
  @RequireFeature('video.upload')
  @RequirePermission('lesson:write')
  @Get('resources/:id/video-upload/status')
  resourceVideoUploadStatus(@Param('id') id: string) {
    return this.resourceUploads.status(id);
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
