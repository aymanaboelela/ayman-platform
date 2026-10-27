import { Controller, Get } from '@nestjs/common';
import type { AutoOutreachOverview } from '@ayman/contracts/outreach/auto';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AutoOutreachOverviewService } from './auto-outreach-overview.service';

/**
 * `GET /api/admin/outreach/auto` — the «رسايل الواتساب التلقائية» card.
 *
 * Read-only for the reason `AdminOutreachController` gives: whether and how
 * often the platform speaks is a SETTING, changed under `settings:write` and
 * audited there. `outreach:read`, the same authority as the rest of the log.
 *
 * Its own controller rather than a fourth route on `AdminOutreachController`,
 * because this one is behind an entitlement and that one is not — and a
 * controller-level `@RequireFeature` is the shape that cannot be forgotten on
 * the next route added beside it.
 */
@RequireFeature('outreach.whatsapp')
@Controller('admin/outreach/auto')
export class AdminAutoOutreachController {
  constructor(private readonly overview: AutoOutreachOverviewService) {}

  @RequirePermission('outreach:read')
  @Get()
  get(): Promise<AutoOutreachOverview> {
    return this.overview.overview();
  }
}
