import { Body, Controller, Get, NotFoundException, Param, Post, Query, Res, UsePipes } from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { OUTPUT_MIME } from '@ayman/contracts/admin/media';
import type { AdminWallet, AdminWalletSearch, AdminWalletTopupList } from '@ayman/contracts/admin/wallet';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { MediaService } from '../media/media.service';
import {
  AdminApproveWalletTopupDto,
  AdminRejectWalletTopupDto,
  AdminWalletCreditDto,
  AdminWalletDebitDto,
  AdminWalletSearchQueryDto,
  AdminWalletTopupQueryDto,
} from './wallet.dto';
import { WalletService } from './wallet.service';

/**
 * «شحن المحفظة» — the admin's wallet desk. `payment:read` sees balances and
 * statements; `payment:review` moves money — the same split the payments
 * queue makes, for the same reason: looking at money and deciding money are
 * different authorities.
 */
@Controller('admin/wallets')
@UsePipes(ZodValidationPipe)
export class AdminWalletController {
  constructor(private readonly wallet: WalletService) {}

  @RequirePermission('payment:read')
  @Get()
  search(@Query() query: AdminWalletSearchQueryDto): Promise<AdminWalletSearch> {
    return this.wallet.search(query.q);
  }

  @RequirePermission('payment:read')
  @Get(':userId')
  get(@Param('userId') userId: string): Promise<AdminWallet> {
    return this.wallet.adminWallet(userId);
  }

  @RequirePermission('payment:review')
  @Post(':userId/credit')
  credit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() body: AdminWalletCreditDto,
  ): Promise<AdminWallet> {
    return this.wallet.credit(user.id, userId, body);
  }

  @RequirePermission('payment:review')
  @Post(':userId/debit')
  debit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() body: AdminWalletDebitDto,
  ): Promise<AdminWallet> {
    return this.wallet.debit(user.id, userId, body);
  }
}

/**
 * «طلبات الشحن» — the InstaPay / Vodafone Cash top-up queue. Same shape and
 * same permissions as `/admin/payments`, and the same live channel pattern
 * (`wallet-topups`), so the list and the sidebar badge move without a refresh.
 */
@Controller('admin/wallet-topups')
@UsePipes(ZodValidationPipe)
export class AdminWalletTopupsController {
  constructor(
    private readonly wallet: WalletService,
    private readonly media: MediaService,
  ) {}

  @RequirePermission('payment:read')
  @Get()
  list(@Query() query: AdminWalletTopupQueryDto): Promise<AdminWalletTopupList> {
    return this.wallet.listTopups(query);
  }

  /** The screenshot — gated and streamed exactly like a payment claim's, never
   *  through the public media route (it can carry a name, a number, a balance). */
  @RequirePermission('payment:read')
  @Get(':id/screenshot')
  async screenshot(@Param('id') id: string, @Res() response: Response): Promise<void> {
    const key = await this.wallet.topupScreenshotKey(id);
    const info = await this.media.statByKey(key);
    if (!info) throw new NotFoundException();

    response.set({
      'Content-Type': OUTPUT_MIME,
      'Content-Length': String(info.size),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    (await this.media.streamByKey(key)).pipe(response);
  }

  @RequirePermission('payment:review')
  @Post(':id/approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: AdminApproveWalletTopupDto,
  ) {
    return this.wallet.approveTopup(user.id, id, body);
  }

  @RequirePermission('payment:review')
  @Post(':id/reject')
  async reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: AdminRejectWalletTopupDto,
  ): Promise<{ ok: true }> {
    await this.wallet.rejectTopup(user.id, id, body);
    return { ok: true };
  }
}
