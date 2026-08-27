import { Body, Controller, Delete, Get, Param, Post, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AdminManualSubscribeDto } from './payments.dto';
import { PaymentsService } from './payments.service';

/**
 * The admin student page's manual-subscribe section — a NEW entry point into
 * the same paid-subscription machinery `/admin/payments`'s review queue
 * already runs, not a second one. See `PaymentsService.adminManualSubscribe`
 * for what actually happens: the same `AccessGrant`/`Enrollment` state a
 * genuine approval produces.
 *
 * Deliberately its own controller rather than a method on
 * `StudentsController`: the permission this needs is `payment:review` (the
 * same authority that already decides money in or out of the review queue),
 * not `student:write` — a student's year and this are different authorities,
 * same principle as every other split in `permissions.ts`. Nested under
 * `admin/students/:userId` for the same reason `AdminStudentsController`'s
 * own `/grants` routes are: it is fundamentally about ONE student.
 */
@Controller('admin/students/:userId/subscriptions')
export class AdminStudentSubscriptionsController {
  constructor(private readonly payments: PaymentsService) {}

  @RequirePermission('payment:read')
  @Get()
  list(@Param('userId') userId: string) {
    return this.payments.adminListSubscriptions(userId);
  }

  @RequirePermission('payment:review')
  @Post()
  @UsePipes(ZodValidationPipe)
  subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() body: AdminManualSubscribeDto,
  ) {
    return this.payments.adminManualSubscribe(user.id, userId, body);
  }

  @RequirePermission('payment:review')
  @Delete(':grantId')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Param('grantId') grantId: string,
  ) {
    return this.payments.adminCancelSubscription(user.id, userId, grantId);
  }
}
