import { Body, Controller, HttpCode, Post, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { CheckoutIntentDto } from './auto-outreach.dto';
import { CheckoutIntentsService } from './checkout-intents.service';

/**
 * `POST /api/checkout-intents` — «فتحت خطوة الدفع», sent by the subscribe
 * panel and the book payment step when they open.
 *
 * `payment:submit`, the permission every other door to a checkout carries:
 * the same student who may pay may say they looked at paying, and nobody else
 * — the row is about the session's own account and `user.id` is the only id
 * it ever writes under.
 *
 * Behind `outreach.whatsapp` like the sweeper that reads it. On a stack
 * without the feature the route is a 404 the panel swallows, and no teacher's
 * database accumulates rows nothing will ever read.
 */
@RequireFeature('outreach.whatsapp')
@Controller('checkout-intents')
export class CheckoutIntentsController {
  constructor(private readonly intents: CheckoutIntentsService) {}

  @RequirePermission('payment:submit')
  @UsePipes(ZodValidationPipe)
  @HttpCode(200)
  @Post()
  async record(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CheckoutIntentDto,
  ): Promise<{ ok: true }> {
    await this.intents.record(user.id, body);
    return { ok: true };
  }
}
