import { Controller, Get } from '@nestjs/common';
import type { AdminMobilePending, AdminMobileToday } from '@ayman/contracts/admin/mobile';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AdminMobileService } from './admin-mobile.service';

/**
 * The admin app's reads of its own: the icon number, and the «النهارده»
 * band on `/admin`.
 *
 * `admin:access` and not a queue permission, because the answer is already
 * cut to the caller — a queue they cannot see is counted as `0` inside
 * `AdminMobileService.pending`, so an assistant who only marks homework gets
 * a number about homework and nothing else.
 */
@Controller('admin/mobile')
@RequireFeature('adminMobile')
export class AdminMobileController {
  constructor(private readonly mobile: AdminMobileService) {}

  @RequirePermission('admin:access')
  @Get('pending')
  pending(@CurrentUser() user: AuthenticatedUser): Promise<AdminMobilePending> {
    return this.mobile.pending(user);
  }

  /** Same reasoning as `pending`: every part is already cut to the caller. */
  @RequirePermission('admin:access')
  @Get('today')
  today(@CurrentUser() user: AuthenticatedUser): Promise<AdminMobileToday> {
    return this.mobile.today(user);
  }
}
