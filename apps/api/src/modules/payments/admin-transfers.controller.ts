import { Body, Controller, Get, Param, Post, Query, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import {
  AdminTransferFilterSchema,
  type AdminTransferList,
  type IngestTransfersResult,
} from '@ayman/contracts/admin/transfers';

import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { IngestTransfersDto } from './payments.dto';
import { TransfersService } from './transfers.service';

/** One screen's worth. The ledger is read, not paged through — an admin looks
 *  at what has not been explained yet, which is a short list by design. */
const PAGE_SIZE = 100;

/**
 * «التحويلات الواردة» for a human.
 *
 * Reuses `payment:read`/`payment:review` rather than inventing a permission:
 * this list is the evidence behind the review queue those two already govern,
 * and someone trusted to approve a payment is exactly who may say a stray
 * transfer needs no action.
 */
@Controller('admin/transfers')
export class AdminTransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @RequirePermission('payment:read')
  @Get()
  list(@Query('filter') filter?: string): Promise<AdminTransferList> {
    return this.transfers.adminList(
      AdminTransferFilterSchema.catch('unmatched').parse(filter),
      PAGE_SIZE,
    );
  }

  /**
   * The paste box — the same ingest the Shortcut calls, for when the Shortcut
   * is not to hand or its token is not configured yet. Session-authenticated
   * rather than token-authenticated, because here there IS an admin.
   */
  @RequirePermission('payment:review')
  @UsePipes(ZodValidationPipe)
  @Post('ingest')
  ingest(@Body() body: IngestTransfersDto): Promise<IngestTransfersResult> {
    return this.transfers.ingest(body);
  }

  @RequirePermission('payment:review')
  @Post(':id/dismiss')
  async dismiss(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.transfers.dismiss(user.id, id);
    return { ok: true };
  }
}
