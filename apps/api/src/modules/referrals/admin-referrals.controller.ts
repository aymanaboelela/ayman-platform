import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type {
  AdminReferralList,
  AdminReferralRow,
  ReferralProgram,
  TopReferrer,
} from '@ayman/contracts/admin/referrals';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AdminReferralQueryDto, ReferralProgramDto, VoidReferralDto } from './referrals.dto';
import { ReferralsService } from './referrals.service';

/**
 * «التسويق ← دعوة الصحاب». `marketing:read` sees it, `marketing:write` sets
 * the program's numbers, and «إلغاء» — which can take money back out of two
 * wallets — is `payment:review`, the authority that moves wallet money
 * everywhere else.
 */
@Controller('admin/referrals')
@RequireFeature('referrals')
@UsePipes(ZodValidationPipe)
export class AdminReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @RequirePermission('marketing:read')
  @Get()
  list(@Query() query: AdminReferralQueryDto): Promise<AdminReferralList> {
    return this.referrals.list(query);
  }

  /* Static routes before `:id` — Nest matches in declaration order. */
  @RequirePermission('marketing:read')
  @Get('program')
  program(): Promise<ReferralProgram> {
    return this.referrals.program();
  }

  @RequirePermission('marketing:write')
  @Put('program')
  updateProgram(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ReferralProgramDto,
  ): Promise<ReferralProgram> {
    return this.referrals.updateProgram(user.id, body);
  }

  @RequirePermission('marketing:read')
  @Get('top')
  top(): Promise<TopReferrer[]> {
    return this.referrals.top();
  }

  @RequirePermission('payment:review')
  @Post(':id/void')
  void(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: VoidReferralDto,
  ): Promise<AdminReferralRow> {
    return this.referrals.void(user.id, id, body);
  }
}
