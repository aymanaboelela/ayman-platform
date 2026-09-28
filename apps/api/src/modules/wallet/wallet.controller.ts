import { Body, Controller, Get, Post, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type { MyWallet, WalletBalance, WalletTopup } from '@ayman/contracts/wallet';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { SubmitWalletTopupDto } from './wallet.dto';
import { WalletService } from './wallet.service';

/**
 * «المحفظة» — the student's half. `payment:submit` throughout, the same
 * self-scoped permission the course checkout uses: every method reads
 * `user.id` off the session and never a route parameter, so there is no id
 * here to point at somebody else's wallet.
 *
 * Buying a course FROM the wallet is `POST /payments/wallet-purchase`, beside
 * the transfer claim it replaces — see `PaymentsService.purchaseFromWallet`.
 */
@Controller('wallet')
@UsePipes(ZodValidationPipe)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @RequirePermission('payment:submit')
  @Get()
  mine(@CurrentUser() user: AuthenticatedUser): Promise<MyWallet> {
    return this.wallet.mine(user.id);
  }

  /** The checkout's read — the balance and nothing else. */
  @RequirePermission('payment:submit')
  @Get('balance')
  balance(@CurrentUser() user: AuthenticatedUser): Promise<WalletBalance> {
    return this.wallet.balance(user.id);
  }

  @RequirePermission('payment:submit')
  @Post('topups')
  submitTopup(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SubmitWalletTopupDto,
  ): Promise<WalletTopup> {
    return this.wallet.submitTopup(user.id, body);
  }
}
