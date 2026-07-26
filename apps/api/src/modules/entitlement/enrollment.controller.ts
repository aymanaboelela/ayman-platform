import { Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { EntitlementService } from './entitlement.service';

@Controller()
export class EnrollmentController {
  constructor(private readonly entitlement: EntitlementService) {}

  /** `user.id` comes from the session. There is no user id in this route at all. */
  @RequirePermission('enrollment:create')
  @Post('courses/:courseId/enroll')
  enroll(@CurrentUser() user: AuthenticatedUser, @Param('courseId') courseId: string) {
    return this.entitlement.enroll(user.id, courseId);
  }

  @RequirePermission('enrollment:read')
  @Get('enrollments')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.entitlement.listOwnEnrollments(user.id);
  }
}
