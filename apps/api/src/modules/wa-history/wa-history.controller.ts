import { Controller, Get } from '@nestjs/common';
import type { WaHistorySummary } from '@ayman/contracts/marketing/wa-history';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { WaHistoryService } from './wa-history.service';

/**
 * `/api/admin/wa-history` — what the admin screens say about the linked
 * number's old chats. Read-only, counts only.
 *
 * `marketing:read`, the authority that already reads the device and the
 * campaigns: the summary sits on the campaign form, beside the audience it
 * describes. The students list's «كلّمني / مكلّمنيش» filter goes through the
 * students route itself and its own `student:read`.
 */
@RequireFeature('whatsapp.history')
@Controller('admin/wa-history')
export class WaHistoryController {
  constructor(private readonly history: WaHistoryService) {}

  @RequirePermission('marketing:read')
  @Get('summary')
  summary(): Promise<WaHistorySummary> {
    return this.history.summary();
  }
}
