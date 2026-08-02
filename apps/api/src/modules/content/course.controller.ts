import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { CourseService } from './course.service';
import {
  CreateCourseDto,
  SetCourseExamDto,
  SetCourseStatusDto,
  UpdateCourseDto,
} from './dto/course.dto';

@Controller('admin/courses')
@UsePipes(ZodValidationPipe)
export class CourseController {
  constructor(private readonly courses: CourseService) {}

  /**
   * Plan 6 Task 15's homepage `courseGrid` block picker will eventually need a
   * `?ids=` filter on this endpoint — that DTO and query handling belong to
   * that later task, which also owns the admin dashboard surface that
   * consumes it. Task 6's scope is `.list()` with no arguments, per this
   * task's own Interfaces declaration; adding an unscoped filter here now
   * would be inventing a contract nobody downstream has asked for yet.
   *
   * `course:read-admin`, NOT `course:read`: the latter is also held by
   * `student` (for the player/catalog read path), and this endpoint returns
   * every course regardless of status — draft titles, unpublished section/
   * lesson trees, video external ids — to anyone who holds it. See the
   * permission catalogue's own comment for how this was found.
   */
  @RequirePermission('course:read-admin')
  @Get()
  list() {
    return this.courses.list();
  }

  @RequirePermission('course:read-admin')
  @Get(':id')
  one(@Param('id') id: string) {
    return this.courses.findForAdmin(id);
  }

  @RequirePermission('course:create')
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateCourseDto) {
    return this.courses.create(user.id, body);
  }

  @RequirePermission('course:update')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateCourseDto) {
    return this.courses.update(id, body);
  }

  /** Separate route, separate permission. This is the whole point of Task 6. */
  @RequirePermission('course:publish')
  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() body: SetCourseStatusDto) {
    return this.courses.setStatus(id, body.status);
  }

  /**
   * Designating the final exam is `course:update`, not `course:publish`: it is
   * an authoring decision about the course's own content, not a decision to
   * make that content public.
   */
  @RequirePermission('course:update')
  @Put(':id/exam')
  setExam(@Param('id') id: string, @Body() body: SetCourseExamDto) {
    return this.courses.setExamLesson(id, body.examLessonId);
  }

  @RequirePermission('course:delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.courses.remove(id);
  }
}
