import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser, type AuthenticatedUser } from '../../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../auth/decorators/require-permission.decorator';
import { StudentsService } from './students.service';
import {
  AdminGrantCreateDto,
  AdminRoleChangeDto,
  AdminStudentBanDto,
  AdminStudentDeleteDto,
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

  /*
   * حظر / رفع الحظر.
   *
   * `student:ban`, not `student:write`: editing a year is a correction, and
   * locking someone out of a platform they paid attention to is not the same
   * authority. See `permissions.ts`.
   *
   * `@Post` for both halves rather than a PATCH carrying a boolean. They are
   * two distinct operations with two distinct audit actions and two different
   * request bodies — banning requires a reason, unbanning cannot have one —
   * and a single toggle endpoint would have to accept both shapes and decide
   * between them at runtime.
   */
  @RequirePermission('student:ban')
  @Post(':userId/ban')
  ban(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() body: AdminStudentBanDto,
  ) {
    return this.students.ban(userId, body.reason, user.id);
  }

  @RequirePermission('student:ban')
  @Post(':userId/unban')
  unban(@CurrentUser() user: AuthenticatedUser, @Param('userId') userId: string) {
    return this.students.unban(userId, user.id);
  }

  /*
   * مسح نهائي.
   *
   * `@Delete` with a BODY, which is unusual enough to justify: the body
   * carries `confirmEmail`, and the whole point of that field is that it must
   * not be expressible as a URL an admin could arrive at by following a link
   * or replaying a browser history entry. A query parameter would be both.
   *
   * Express and Nest both accept a body on DELETE, and `apiDelete` on the web
   * side already forwards one.
   */
  @RequirePermission('student:delete')
  @Delete(':userId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() body: AdminStudentDeleteDto,
  ) {
    return this.students.remove(userId, body, user.id);
  }
}
