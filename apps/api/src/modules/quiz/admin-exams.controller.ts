import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import {
  AdminExamCreateDto,
  AdminExamDuplicateDto,
  AdminExamPatchDto,
  ExamPublishDto,
} from './dto/exam.dto';
import { ScheduledExamsService } from './scheduled-exams.service';

/**
 * `/api/admin/exams` — «امتحانات الشهر».
 *
 * ## Why `quiz:write` and not a new permission
 *
 * A monthly exam IS a quiz; authoring one is authoring a quiz. Inventing
 * `exam:write` would add a second answer to "may this person write a paper" and
 * `ROLE_PERMISSIONS` would have to grant both to the same single admin role
 * anyway.
 *
 * ⚠️ Not `quiz:read`. That one is in the STUDENT permission set
 * (`apps/api/src/auth/permissions.ts`), and gating an admin surface on a student
 * permission is the exact bug `nav-items.ts` documents at length on its courses
 * row (`course:read` vs `course:read-admin`).
 *
 * ## Route ordering
 *
 * Every literal segment (`courses/...`) is registered BEFORE the `:lessonId`
 * routes, so a literal can never be swallowed as an id — the same rule
 * `AdminQuizzesController` states for its own `lesson`/`slots` segments.
 *
 * ## Every route returns an object
 *
 * NestJS's Express adapter only calls `response.json()` for an OBJECT return
 * value; a bare string or `void` goes through `response.send(String(body))`,
 * which is not valid JSON. Every browser caller here does `await
 * response.json()`, so an unwrapped return turns a successful write into a
 * thrown parse error the client reports as "save failed".
 */
@Controller('admin/exams')
@RequirePermission('quiz:write')
@UsePipes(ZodValidationPipe)
export class AdminExamsController {
  constructor(private readonly exams: ScheduledExamsService) {}

  @Get()
  list() {
    return this.exams.list();
  }

  /** The coverage picker. Literal segment first — see the class note. */
  @Get('courses/:courseId/lessons')
  lessonPicker(@Param('courseId') courseId: string) {
    return this.exams.lessonPicker(courseId);
  }

  @Post()
  create(@Body() body: AdminExamCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.exams.create(body, user.id);
  }

  @Patch(':lessonId')
  async patch(
    @Param('lessonId') lessonId: string,
    @Body() body: AdminExamPatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.exams.patch(lessonId, body, user.id);
    return { ok: true };
  }

  /**
   * ONE endpoint for both directions, and one call for both writes.
   *
   * Publishing an exam means publishing its quiz AND its lesson, in that order,
   * behind the builder's preflight. A client doing it as two calls can leave a
   * live quiz on an invisible lesson if the second one fails — which reads to
   * the owner as "it just didn't work" with nothing to act on.
   */
  @Put(':lessonId/published')
  async setPublished(
    @Param('lessonId') lessonId: string,
    @Body() body: ExamPublishDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.exams.setPublished(lessonId, body.published, user.id);
    return { published: body.published };
  }

  @Post(':lessonId/duplicate')
  duplicate(
    @Param('lessonId') lessonId: string,
    @Body() body: AdminExamDuplicateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exams.duplicate(lessonId, body, user.id);
  }

  /** Refuses once anyone has sat it — the honest action then is to unpublish,
   *  which takes it off the dashboard and keeps every grade. */
  @Delete(':lessonId')
  async remove(@Param('lessonId') lessonId: string, @CurrentUser() user: AuthenticatedUser) {
    await this.exams.remove(lessonId, user.id);
    return { ok: true };
  }
}
