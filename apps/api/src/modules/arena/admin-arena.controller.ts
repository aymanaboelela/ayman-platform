import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AdminArena } from '@ayman/contracts/arena';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { ArenaOpenGuard } from './arena-gate.service';
import { ArenaRecordsService } from './arena-records.service';

/**
 * «الساحة» في لوحة الألعاب — آخر الماتشات وأعلى النقط، قراية بس.
 *
 * `analytics:read` زي «إحصائيات الألعاب» (`AdminGameStatsController`): مين
 * بيلعب مع مين سؤال عن الطلبة. ونفس فلاج الساحة — مقفولة = الشاشة مش موجودة.
 */
@Controller('admin/arena')
@UseGuards(ArenaOpenGuard)
@RequirePermission('analytics:read')
export class AdminArenaController {
  constructor(private readonly records: ArenaRecordsService) {}

  @Get()
  overview(): Promise<AdminArena> {
    return this.records.admin();
  }
}
