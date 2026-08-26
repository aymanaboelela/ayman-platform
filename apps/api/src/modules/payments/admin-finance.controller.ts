import { Controller, Get, Query, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AdminFinanceQueryDto } from './payments.dto';
import { FinanceService } from './finance.service';

/**
 * «الاشتراكات والإيرادات». Same `payment:read` as the review queue — this is
 * a read-only report over the same domain data, not a second capability an
 * admin could be granted independently of it.
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
}
