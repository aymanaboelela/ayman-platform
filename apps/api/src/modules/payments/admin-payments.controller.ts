import { Body, Controller, Get, NotFoundException, Param, Post, Query, Res, UsePipes } from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { OUTPUT_MIME } from '@ayman/contracts/admin/media';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { MediaService } from '../media/media.service';
import { AdminPaymentQueryDto, RejectPaymentDto } from './payments.dto';
import { PaymentsService } from './payments.service';

/**
 * The review queue. `payment:read` sees it; `payment:review` decides money —
 * see the permission catalogue's own note on why the two are split.
 */
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly media: MediaService,
  ) {}

  @RequirePermission('payment:read')
  @Get('submissions')
  @UsePipes(ZodValidationPipe)
  list(@Query() query: AdminPaymentQueryDto) {
    return this.payments.adminList(query);
  }

  /**
   * The screenshot, gated by permission rather than by an unguessable key —
   * see the model note on `PaymentSubmission.screenshotKey` for why this
   * does NOT go through the public `/media/:prefix/:name` route. Same
   * streamed-not-buffered shape as `PlayerController.serveResource`.
   */
  @RequirePermission('payment:read')
  @Get('submissions/:id/screenshot')
  async screenshot(@Param('id') id: string, @Res() response: Response): Promise<void> {
    const key = await this.payments.screenshotKeyFor(id);
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
  @Post('submissions/:id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.payments.approve(user.id, id);
  }

  @RequirePermission('payment:review')
  @Post('submissions/:id/reject')
  async reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: RejectPaymentDto,
  ): Promise<{ ok: true }> {
    await this.payments.reject(user.id, id, body);
    return { ok: true };
  }
}
