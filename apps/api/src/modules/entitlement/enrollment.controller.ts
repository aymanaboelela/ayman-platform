import { Controller, Get, Param, Post } from '@nestjs/common';
import type { EnrollmentDto } from '@ayman/contracts';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { EntitlementService } from './entitlement.service';

@Controller()
export class EnrollmentController {
  constructor(
    private readonly entitlement: EntitlementService,
    private readonly enrollment: EnrollmentService,
  ) {}

  /** `user.id` comes from the session. There is no user id in this route at all. */
  @RequirePermission('enrollment:create')
  @Post('courses/:courseId/enroll')
  enroll(@CurrentUser() user: AuthenticatedUser, @Param('courseId') courseId: string) {
    return this.entitlement.enroll(user.id, courseId);
  }

  /**
   * Plan 4: was a bare Prisma `findMany`; now returns `progressPercent` and
   * `lastLessonId` too, via `EnrollmentService.listOwn`.
   */
  @RequirePermission('enrollment:read')
  @Get('enrollments')
  mine(@CurrentUser() user: AuthenticatedUser): Promise<EnrollmentDto[]> {
    return this.enrollment.listOwn(user.id);
  }
}
