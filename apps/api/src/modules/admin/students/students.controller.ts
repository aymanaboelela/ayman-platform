import { Body, Controller, Get, Param, Patch, Post, Query, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser, type AuthenticatedUser } from '../../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../auth/decorators/require-permission.decorator';
import { StudentsService } from './students.service';
import { AdminRoleChangeDto, AdminStudentPatchDto, StudentListQueryDto } from './students.dto';

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
