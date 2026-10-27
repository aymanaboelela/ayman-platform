import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { MonthKeySchema, type RecapPayload } from '@ayman/contracts/engagement';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RecapService } from './recap.service';

/** «ملخص الشهر» — `enrollment:read`, behind `monthlyRecap`. `?month=YYYY-MM`, optional. */
@Controller('me/recap')
@RequireFeature('monthlyRecap')
@RequirePermission('enrollment:read')
export class RecapController {
  constructor(private readonly recap: RecapService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser, @Query('month') month?: string): Promise<RecapPayload> {
    if (month !== undefined && !MonthKeySchema.safeParse(month).success) throw new BadRequestException();
    return this.recap.forUser(user.id, month ?? null);
  }
}
