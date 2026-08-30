import { Body, Controller, Get, Param, Patch, Post, Query, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import {
  AdminFinanceCancelDto,
  AdminFinanceEditAmountDto,
  AdminFinanceEditDatesDto,
  AdminFinanceQueryDto,
} from './payments.dto';
import { FinanceService } from './finance.service';

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
  constructor(private readonly finance: FinanceService) {}

  @RequirePermission('payment:read')
  @Get()
  @UsePipes(ZodValidationPipe)
  list(@Query() query: AdminFinanceQueryDto) {
    return this.finance.list(query);
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
