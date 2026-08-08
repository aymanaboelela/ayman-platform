import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser, type AuthenticatedUser } from '../../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../auth/decorators/require-permission.decorator';
import { StudentsService } from './students.service';
import {
  AdminGrantCreateDto,
  AdminRoleChangeDto,
  AdminStudentPatchDto,
  StudentListQueryDto,
} from './students.dto';

@Controller('admin/students')
@UsePipes(ZodValidationPipe)
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @RequirePermission('student:read')
  @Get()
  list(@Query() query: StudentListQueryDto) {
    return this.students.list(query);
  }

  @RequirePermission('student:read')
  @Get(':userId')
  detail(@Param('userId') userId: string) {
    return this.students.detail(userId);
  }

  @RequirePermission('student:write')
  @Patch(':userId')
  patch(@Param('userId') userId: string, @Body() body: AdminStudentPatchDto) {
    return this.students.patch(userId, body);
  }

  /*
   * Opening and closing a course for one student.
   *
   * `student:write`, the same permission that edits their year and track —
   * not `student:role-change`, which is reserved for the one operation that
   * can lock every admin out of the platform. Granting a course is an
   * ordinary teaching decision and is fully reversible.
   */
  @RequirePermission('student:read')
  @Get(':userId/grants')
  listGrants(@Param('userId') userId: string) {
    return this.students.listGrants(userId);
  }

  @RequirePermission('student:write')
  @Post(':userId/grants')
  grantCourse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() body: AdminGrantCreateDto,
  ) {
    return this.students.grantCourse(userId, body, user.id);
  }

  @RequirePermission('student:write')
  @Delete(':userId/grants/:grantId')
  revokeGrant(@Param('userId') userId: string, @Param('grantId') grantId: string) {
    return this.students.revokeGrant(userId, grantId);
  }

  @RequirePermission('student:role-change')
  @Post(':userId/role')
  changeRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() body: AdminRoleChangeDto,
  ) {
    return this.students.changeRole(userId, body, user.id);
  }
}
