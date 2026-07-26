import { Body, Controller, Delete, Param, Patch, Post, Put, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { LessonService } from './lesson.service';
import {
  AddAttachmentDto,
  CreateLessonDto,
  SetLessonTextDto,
  SetLessonVideoDto,
  UpdateLessonDto,
} from './dto/lesson.dto';

@Controller('admin')
@UsePipes(ZodValidationPipe)
export class LessonController {
  constructor(private readonly lessons: LessonService) {}

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

  @RequirePermission('lesson:write')
  @Post('lessons/:id/attachments')
  addAttachment(@Param('id') id: string, @Body() body: AddAttachmentDto) {
    return this.lessons.addAttachment(id, body);
  }

  @RequirePermission('lesson:write')
  @Delete('attachments/:id')
  removeAttachment(@Param('id') id: string) {
    return this.lessons.removeAttachment(id);
  }
}
