import { Controller, Get, Query, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type { AdminAttemptsOverview } from '@ayman/contracts/admin/attempts';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AttemptsOverviewService } from './attempts-overview.service';
import { AdminAttemptsOverviewQueryDto } from './dto/attempt-admin.dto';

/**
 * `GET /api/admin/attempts/overview` — «محاولات الطلاب» by course, unit and
 * quiz.
 *
 * Its own controller rather than one more route on `AdminAttemptsController`
 * for one reason: this read needs nothing but Prisma, and keeping it apart
 * lets the full-product authorization matrix register it by class — that
 * controller drags in the whole attempt engine through `AttemptAdminService`.
 *
 * ⚠️ `attempts/overview` is a literal segment that a `GET attempts/:id` would
 * swallow. None exists today; this controller is registered BEFORE
 * `AdminAttemptsController` in `QuizModule` so it would still win if one were
 * added.
 *
 * `attempt:read`, the permission the sittings list itself carries: this is the
 * same information, counted.
 */
@Controller('admin')
@UsePipes(ZodValidationPipe)
export class AdminAttemptsOverviewController {
  constructor(private readonly overview: AttemptsOverviewService) {}

  @RequirePermission('attempt:read')
  @Get('attempts/overview')
  get(@Query() query: AdminAttemptsOverviewQueryDto): Promise<AdminAttemptsOverview> {
    return this.overview.overview(query);
  }
}
