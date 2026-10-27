import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type { LessonNote, LessonNotes, Notebook } from '@ayman/contracts/engagement';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { NoteCreateDto, NoteEditDto } from './engagement.dto';
import { NotesService } from './notes.service';

/**
 * «ملاحظاتي» — `enrollment:read` (a note is a student's own mark on a lesson
 * they are enrolled in), behind `lessonNotes`. No student id anywhere in a
 * path: the session is the only owner a note can have.
 */
@Controller('me')
@RequireFeature('lessonNotes')
@RequirePermission('enrollment:read')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get('notes')
  notebook(@CurrentUser() user: AuthenticatedUser): Promise<Notebook> {
    return this.notes.notebook(user.id);
  }

  @Get('lessons/:lessonId/notes')
  forLesson(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ): Promise<LessonNotes> {
    return this.notes.forLesson(user.id, lessonId);
  }

  @Post('lessons/:lessonId/notes')
  @UsePipes(ZodValidationPipe)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() dto: NoteCreateDto,
  ): Promise<LessonNote> {
    return this.notes.create(user.id, lessonId, dto);
  }

  @Patch('notes/:noteId')
  @UsePipes(ZodValidationPipe)
  edit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Body() dto: NoteEditDto,
  ): Promise<LessonNote> {
    return this.notes.edit(user.id, noteId, dto.body);
  }

  @Delete('notes/:noteId')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('noteId', ParseUUIDPipe) noteId: string): Promise<void> {
    return this.notes.remove(user.id, noteId);
  }
}
