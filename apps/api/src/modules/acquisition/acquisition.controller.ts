import { Body, Controller, HttpCode, Post, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type { AcquisitionClaimResult } from '@ayman/contracts/acquisition';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AcquisitionClaimDto } from './acquisition.dto';
import { AcquisitionService } from './acquisition.service';

/**
 * «الحساب ده جه منين» — the account's half: one write, about itself.
 *
 * `profile:write`, the self-scoped permission onboarding uses, and for the
 * same S11 reason: the account is `user.id` off the session and the body has
 * nowhere to name another one. No `@RequireFeature` — recording costs nothing
 * and carries nobody's identity, so every stack does it (CLAUDE.md §3); only
 * the admin's report is a feature.
 *
 * 200, not 201: most calls create nothing, and the answer says which.
 */
@Controller('me/acquisition')
export class AcquisitionController {
  constructor(private readonly acquisition: AcquisitionService) {}

  @RequirePermission('profile:write')
  @Post()
  @HttpCode(200)
  @UsePipes(ZodValidationPipe)
  async claim(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: AcquisitionClaimDto,
  ): Promise<AcquisitionClaimResult> {
    return { outcome: await this.acquisition.claim(user.id, body) };
  }
}
