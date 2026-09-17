import { Body, Controller, Get, NotFoundException, Param, Post, Query, Res, UsePipes } from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { OUTPUT_MIME } from '@ayman/contracts/admin/media';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { MediaService } from '../media/media.service';
import { AdminPaymentQueryDto, RejectPaymentDto } from './payments.dto';
import { PaymentsService } from './payments.service';
import { TransfersService } from './transfers.service';

/**
 * The review queue. `payment:read` sees it; `payment:review` decides money —
 * see the permission catalogue's own note on why the two are split.
 */
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly media: MediaService,
    private readonly transfers: TransfersService,
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
  /**
   * Approve, and let «التحويلات الواردة» learn from it.
   *
   * The admin has just done the identification the platform could not — they
   * looked at the screenshot and at the money and said yes — so this is the
   * moment the sender's InstaPay address can be bound to this student, and
   * every payment from it after today needs nobody. See
   * `TransfersService.learnFromApproval`, which does nothing at all when the
   * evidence is ambiguous.
   *
   * Called from the controller rather than from inside `approve()` so the two
   * services do not have to reference each other — `TransfersService` already
   * depends on `PaymentsService` for the reverse direction.
   *
   * Best effort, deliberately: a failure to learn must never turn a completed
   * approval into an error the admin sees. The student has their access; the
   * worst case is that the next payment is reviewed by hand too.
   */
  @Post('submissions/:id/approve')
  async approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.payments.approve(user.id, id);
    await this.transfers.learnFromApproval(id).catch(() => undefined);
    return result;
  }

  @RequirePermission('payment:review')
  @UsePipes(ZodValidationPipe)
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
