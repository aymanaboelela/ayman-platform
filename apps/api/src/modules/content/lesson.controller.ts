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
import { extractYouTubeId } from '@ayman/contracts/video';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { LessonService } from './lesson.service';
import { YouTubeDurationService } from './youtube-duration.service';
import {
  AddResourceDto,
  CreateLessonDto,
  ReorderDto,
  SetLessonTextDto,
  SetLessonVideoDto,
  UpdateLessonDto,
  UpdateResourceDto,
} from './dto/lesson.dto';

@Controller('admin')
@UsePipes(ZodValidationPipe)
export class LessonController {
  constructor(
    private readonly lessons: LessonService,
    private readonly youtube: YouTubeDurationService,
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
   * ⚠️ Two path segments, so it cannot be captured by any `lessons/:id/…`
   * route; it is declared before them anyway, since Nest matches in order.
   */
  @RequirePermission('lesson:write')
  @Get('lessons/video-duration')
  async videoDuration(@Query('url') url?: string): Promise<{ durationSeconds: number | null }> {
    const externalId = extractYouTubeId(url ?? '');
    if (externalId === null) throw new BadRequestException(copy.admin.lesson.videoUrlInvalid);
    return { durationSeconds: await this.youtube.durationOf(externalId) };
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

  @RequirePermission('lesson:write')
  @Put('lessons/:id/text')
  setText(@Param('id') id: string, @Body() body: SetLessonTextDto) {
    return this.lessons.setText(id, body);
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
