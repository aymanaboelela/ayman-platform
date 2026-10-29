import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type { AdminCouponList, AdminCouponRedemptions, AdminCouponRow } from '@ayman/contracts/admin/coupons';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AdminCouponCreateDto, AdminCouponQueryDto, AdminCouponUpdateDto } from './coupons.dto';
import { CouponsService } from './coupons.service';

/**
 * «كوبونات الخصم» — the admin screen's API.
 *
 * On `payment:*` like «أكواد الفتح»: a coupon decides what a student PAYS, so
 * the people who may approve a transfer are the people who may make one, and
 * the people who may read the payments list may read this one.
 *
 * `@RequireFeature('coupons')` on the class — off on every stack but the one
 * the owner opened it for (`entitlements.ts`), and 404 there, like every
 * gated feature.
 */
@Controller('admin/coupons')
@RequireFeature('coupons')
@UsePipes(ZodValidationPipe)
export class AdminCouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @RequirePermission('payment:read')
  @Get()
  list(@Query() query: AdminCouponQueryDto): Promise<AdminCouponList> {
    return this.coupons.list(query);
  }

  @RequirePermission('payment:review')
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: AdminCouponCreateDto): Promise<AdminCouponRow> {
    return this.coupons.create(user.id, body);
  }

  @RequirePermission('payment:read')
  @Get(':id/redemptions')
  redemptions(@Param('id', ParseUUIDPipe) id: string): Promise<AdminCouponRedemptions> {
    return this.coupons.redemptions(id);
  }

  @RequirePermission('payment:review')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdminCouponUpdateDto,
  ): Promise<AdminCouponRow> {
    return this.coupons.update(user.id, id, body);
  }

  @RequirePermission('payment:review')
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<{ ok: true }> {
    return this.coupons.remove(user.id, id);
  }
}
