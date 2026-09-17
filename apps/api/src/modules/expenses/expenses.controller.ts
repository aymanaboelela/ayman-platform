import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UsePipes } from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import type {
  AdminExpenseList,
  AdminExpenseRow,
  AdminFinanceOverview,
} from '@ayman/contracts/admin/expenses';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequireCsrf } from '../security/require-csrf.decorator';
import { AdminExpenseCreateDto, AdminExpensePatchDto, AdminExpenseQueryDto } from './expenses.dto';
import { ExpensesService } from './expenses.service';
import { FinanceOverviewService } from './finance-overview.service';

/**
 * المصروفات — what the business paid for.
 *
 * `expense:read` / `expense:write` and never `payment:*`: a payment is money a
 * STUDENT sent and an admin approves; an expense is money Ayman spent and only
 * he records. They are opposite directions with opposite trust models, and
 * sharing a permission would let whoever reviews Vodafone screenshots also
 * rewrite the cost side of «صافي الربح».
 */
@Controller('admin/expenses')
@UsePipes(ZodValidationPipe)
export class ExpensesController {
  constructor(
    private readonly expenses: ExpensesService,
    private readonly overviewService: FinanceOverviewService,
  ) {}

  /**
   * «النظرة العامة» — every figure the finance screen opens with.
   *
   * ⚠️ On `expense:read` and NOT `payment:read`. It reports subscription
   * revenue, so it is at least as sensitive as the payments list — but the
   * split it enforces is the useful one: this is the whole P&L, and holding it
   * should not be implied by being allowed to review one Vodafone screenshot.
   * An admin holds both through `admin: '*'`; a narrower role later gets to
   * choose.
   *
   * On this controller rather than `AdminFinanceController` because it is
   * mostly the expense side — see `FinanceOverviewService`'s own note on why it
   * is not part of `FinanceService`.
   */
  @RequirePermission('expense:read')
  @Get('overview')
  overview(): Promise<AdminFinanceOverview> {
    return this.overviewService.overview();
  }

  /**
   * «حمّل التقرير» — the P&L as a workbook, for anybody who is not sitting in
   * front of this screen.
   *
   * ⚠️ There is no `@Get(':id')` on this controller today, so nothing can
   * swallow this literal path — but adding one later MUST go below it, the
   * same defensive ordering `AdminBookOrdersController` documents around its
   * own `export` route.
   *
   * Same `expense:read` as `overview` above, deliberately: the file carries
   * exactly the figures that endpoint already returns, so a second permission
   * would only be a way for the two to disagree about who may read one set of
   * numbers.
   */
  @RequirePermission('expense:read')
  @Get('report')
  async report(@Res() response: Response): Promise<void> {
    const buffer = await this.overviewService.reportXlsx();
    response.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="finance-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      'Cache-Control': 'private, no-store',
    });
    response.send(buffer);
  }

  @RequirePermission('expense:read')
  @Get()
  list(@Query() query: AdminExpenseQueryDto): Promise<AdminExpenseList> {
    return this.expenses.list(query);
  }

  @RequirePermission('expense:write')
  @RequireCsrf()
  @Post()
  create(
    @Body() body: AdminExpenseCreateDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminExpenseRow> {
    return this.expenses.create(user.id, body);
  }

  @RequirePermission('expense:write')
  @RequireCsrf()
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: AdminExpensePatchDto): Promise<AdminExpenseRow> {
    return this.expenses.update(id, body);
  }

  @RequirePermission('expense:write')
  @RequireCsrf()
  @Delete(':id')
  remove(@Param('id') id: string): Promise<{ ok: true }> {
    return this.expenses.remove(id);
  }
}
