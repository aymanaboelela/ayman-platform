import { Body, Controller, Get, Param, Post, Query, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type { AttemptState } from '../../generated/prisma/enums';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AttemptAdminService } from './attempt-admin.service';
import { GrantExtraTimeDto, ReopenAttemptDto } from './dto/attempt-admin.dto';

/**
 * RECONCILED — `GET /api/admin/attempts` is new here (Plan 6 Task 11's draft
 * declared it, plus a second `POST .../unlock`, inside a second
 * admin-attempts module; that module is removed from Plan 6, which builds
 * only the `/admin/attempts` DataTable screen over these exact routes).
 * `AdminAttemptRow` never carries `attemptToken` — a write credential has no
 * business in a list payload.
 */
@Controller('admin')
@UsePipes(ZodValidationPipe)
export class AdminAttemptsController {
  constructor(private readonly admin: AttemptAdminService) {}

  @RequirePermission('attempt:read')
  @Get('attempts')
  list(
    @Query('quizId') quizId?: string,
    @Query('userId') userId?: string,
    @Query('state') state?: AttemptState,
    @Query('q') q?: string,
    @Query('take') take = '50',
    @Query('skip') skip = '0',
  ) {
    return this.admin.listAttempts({
      quizId,
      userId,
      state,
      q,
      take: Math.min(Number(take) || 50, 200),
      skip: Number(skip) || 0,
    });
  }

  @RequirePermission('attempt:read')
  @Get('quizzes/:quizId/attempts')
  listForQuiz(
    @Param('quizId') quizId: string,
    @Query('userId') userId?: string,
    @Query('state') state?: AttemptState,
    @Query('q') q?: string,
    @Query('take') take = '50',
    @Query('skip') skip = '0',
  ) {
    return this.admin.listAttempts({
      quizId,
      userId,
      state,
      q,
      take: Math.min(Number(take) || 50, 200),
      skip: Number(skip) || 0,
    });
  }

  @RequirePermission('attempt:unlock')
  @Post('attempts/:id/reopen')
  async reopen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') attemptId: string,
    @Body() body: ReopenAttemptDto,
  ) {
    await this.admin.reopen(user.id, attemptId, { extraSeconds: body.extraSeconds });
    return { ok: true };
  }

  @RequirePermission('attempt:unlock')
  @Post('attempts/:id/extra-time')
  async extraTime(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') attemptId: string,
    @Body() body: GrantExtraTimeDto,
  ) {
    await this.admin.grantExtraTime(user.id, attemptId, body.seconds);
    return { ok: true };
  }

  @RequirePermission('attempt:unlock')
  @Post('quizzes/:quizId/students/:userId/extra-attempt')
  async extraAttempt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('quizId') quizId: string,
    @Param('userId') userId: string,
  ) {
    await this.admin.grantExtraAttempt(user.id, quizId, userId);
    return { ok: true };
  }
}
