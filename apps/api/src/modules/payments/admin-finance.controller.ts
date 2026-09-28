import { Body, Controller, Get, Param, Patch, Post, Query, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type {
  AdminFinanceDaily,
  AdminStudentPayments,
} from '@ayman/contracts/admin/finance-daily';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { userHasPermission } from '../../auth/permissions';
import {
  AdminFinanceCancelDto,
  AdminFinanceDailyQueryDto,
  AdminFinanceEditAmountDto,
  AdminFinanceEditDatesDto,
  AdminFinanceQueryDto,
} from './payments.dto';
import { FinanceService } from './finance.service';
import { FinanceDailyService } from './finance-daily.service';

/**
 * «الاشتراكات والإيرادات». `payment:read` sees the list; `payment:review` —
 * the same authority that already decides money in or out of the review
 * queue and the admin student page's manual-subscribe section — is what the
 * three mutations below need too. Not a new permission: every admin today
 * holds `'*'` (see `permissions.ts`), and this is the same class of
 * "decide money and access" decision `adminManualSubscribe`/
 * `adminCancelSubscription` already gate the same way.
 */
@Controller('admin/finance')
export class AdminFinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly daily: FinanceDailyService,
  ) {}

  @RequirePermission('payment:read')
  @Get()
  @UsePipes(ZodValidationPipe)
  list(@Query() query: AdminFinanceQueryDto) {
    return this.finance.list(query);
  }

  /**
   * «الفلوس يوم بيوم» — income, subscriptions and renewals per Cairo day.
   *
   * `payment:read`, the same as the list above: it is the same subscription
   * money, one row per day instead of one per grant. Book income rides along
   * only for a reader who also holds `book-order:read` — that money is
   * `/admin/books`'s, and a role allowed to read subscriptions was never
   * thereby allowed to read it. The response says which (`includesBooks`), so
   * the screen can say «من غير الكتب» instead of silently under-reporting.
   *
   * ⚠️ Literal segments, and there is no `@Get(':grantId')` on this controller
   * today. One added later must go BELOW these two, or it swallows them.
   */
  @RequirePermission('payment:read')
  @Get('daily')
  @UsePipes(ZodValidationPipe)
  dailyReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AdminFinanceDailyQueryDto,
  ): Promise<AdminFinanceDaily> {
    return this.daily.daily({
      days: query.days,
      includeBooks: userHasPermission(user.id, user.role, 'book-order:read'),
    });
  }

  /**
   * One student's subscription payments, newest first — the timeline on
   * `/admin/students/:id`. Here rather than under `admin/students/…` because
   * it is this screen's money read, with this screen's permission; the
   * student page asks for it the way it asks for `/subscriptions`, and a 403
   * is a panel that says so, not a broken page.
   */
  @RequirePermission('payment:read')
  @Get('students/:userId')
  studentPayments(@Param('userId') userId: string): Promise<AdminStudentPayments> {
    return this.daily.forStudent(userId);
  }

  @RequirePermission('payment:review')
  @Patch(':grantId/amount')
  @UsePipes(ZodValidationPipe)
  editAmount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('grantId') grantId: string,
    @Body() body: AdminFinanceEditAmountDto,
  ) {
    return this.finance.editAmount(user.id, grantId, body);
  }

  @RequirePermission('payment:review')
  @Patch(':grantId/dates')
  @UsePipes(ZodValidationPipe)
  editDates(
    @CurrentUser() user: AuthenticatedUser,
    @Param('grantId') grantId: string,
    @Body() body: AdminFinanceEditDatesDto,
  ) {
    return this.finance.editDates(user.id, grantId, body);
  }

  @RequirePermission('payment:review')
  @Post(':grantId/cancel')
  @UsePipes(ZodValidationPipe)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('grantId') grantId: string,
    @Body() body: AdminFinanceCancelDto,
  ) {
    return this.finance.cancel(user.id, grantId, body);
  }
}
