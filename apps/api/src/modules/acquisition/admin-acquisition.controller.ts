import { Controller, Get, Query } from '@nestjs/common';
import {
  AcquisitionReportQuerySchema,
  type AcquisitionReport,
} from '@ayman/contracts/admin/acquisition';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { parseRequest } from '../../common/http/parse-request';
import { AcquisitionService } from './acquisition.service';

/**
 * «التحليلات ← مصادر التسجيل».
 *
 * `payment:read`, not `analytics:read`: every row carries what a campaign's
 * students paid, and «الفلوس يوم بيوم» already draws that line inside the
 * same section. `@RequireFeature` on the report only — «Ayman first», off on
 * another stack until the owner opens it. The recording behind it is not
 * gated, so a stack opened later finds its history already there.
 */
@Controller('admin/acquisition')
@RequireFeature('signupSources')
@RequirePermission('payment:read')
export class AdminAcquisitionController {
  constructor(private readonly acquisition: AcquisitionService) {}

  @Get('report')
  report(@Query() params: { from?: string; to?: string }): Promise<AcquisitionReport> {
    // `parseRequest`, never a bare `.parse()` — a ZodError would be a 500.
    // An empty string is what a cleared date field sends; it means «no bound».
    const query = parseRequest(
      AcquisitionReportQuerySchema,
      { from: params.from || undefined, to: params.to || undefined },
      'report query',
    );
    return this.acquisition.report(query);
  }
}
