import { Body, Controller, Delete, Get, Param, Patch, Post, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { CourseService } from './course.service';
import { CreateCourseDto, SetCourseStatusDto, UpdateCourseDto } from './dto/course.dto';

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
   */
  @RequirePermission('course:read')
  @Get()
  list() {
    return this.courses.list();
  }

  @RequirePermission('course:read')
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

  @RequirePermission('course:delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.courses.remove(id);
  }
}
