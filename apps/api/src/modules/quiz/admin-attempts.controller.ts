import { Body, Controller, Get, Param, Patch, Post, Query, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type { AttemptState } from '../../generated/prisma/enums';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { ATTEMPT_SORTS, type AdminAttemptSort, AttemptAdminService } from './attempt-admin.service';
import { GrantExtraTimeDto, ReopenAttemptDto } from './dto/attempt-admin.dto';
import { AdminGradeAnswerDto } from './dto/exam.dto';
import { ManualGradingService } from './manual-grading.service';

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
  constructor(
    private readonly admin: AttemptAdminService,
    private readonly grading: ManualGradingService,
  ) {}

  /**
   * «شوف ورقته» — one attempt, every question, marked.
   *
   * ⚠️ Declared BEFORE `@Get('attempts')`? No — Nest matches literal segments
   * fine here because the two paths differ in LENGTH, not in shape. The order
   * that would matter is against a `@Get('attempts/:id')`, which does not
   * exist on this controller; adding one later must go BELOW this.
   *
   * `attempt:read` and not `attempt:unlock`: this reads a paper, it does not
   * reopen one. Sharing the write permission would mean the only role allowed
   * to look at a student's answers is the one allowed to change their marks.
   */
  @RequirePermission('attempt:read')
  @Get('attempts/:id/review')
  review(@Param('id') id: string) {
    return this.admin.review(id);
  }

  @RequirePermission('attempt:read')
  @Get('attempts')
  list(
    @Query('quizId') quizId?: string,
    @Query('userId') userId?: string,
    @Query('state') state?: AttemptState,
    @Query('q') q?: string,
    @Query('take') take = '50',
    @Query('skip') skip = '0',
    @Query('sort') sort?: string,
  ) {
    return this.admin.listAttempts({
      quizId,
      userId,
      state,
      q,
      take: Math.min(Number(take) || 50, 200),
      skip: Number(skip) || 0,
      /* Checked against the list rather than cast: this lands in a Prisma
         `orderBy`, and an unrecognised value should fall back to the default
         rather than reach the driver. */
      sort: ATTEMPT_SORTS.includes(sort as AdminAttemptSort)
        ? (sort as AdminAttemptSort)
        : undefined,
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
    @Query('sort') sort?: string,
  ) {
    return this.admin.listAttempts({
      quizId,
      userId,
      state,
      q,
      take: Math.min(Number(take) || 50, 200),
      skip: Number(skip) || 0,
      /* Checked against the list rather than cast: this lands in a Prisma
         `orderBy`, and an unrecognised value should fall back to the default
         rather than reach the driver. */
      sort: ATTEMPT_SORTS.includes(sort as AdminAttemptSort)
        ? (sort as AdminAttemptSort)
        : undefined,
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

  /**
   * ── التصحيح اليدوي ────────────────────────────────────────────────────────
   *
   * ⚠️ These three routes close a hole that was already open, and that had no
   * fix at all: `gradeQuestion` returns `needs_grading` for an essay and never
   * scores it, `needs_grading` sits INSIDE `GRADED_STATES` so the attempt counts
   * as graded everywhere, and `AttemptService.recomputeScore` /
   * `recomputeScoreTx` existed with ZERO callers. An essay question was a
   * permanent, silent zero for every student who ever answered one.
   *
   * `attempt:grade` already exists in the permissions catalogue and is
   * admin-only; it is the permission this always should have had.
   *
   * The literal `grading-queue` segment is registered before `attempts/:id/...`
   * so it can never be swallowed as an attempt id.
   */
  @RequirePermission('attempt:grade')
  @Get('grading-queue')
  gradingQueue() {
    return this.grading.queue();
  }

  @RequirePermission('attempt:grade')
  @Get('attempts/:attemptId/grading')
  gradingForAttempt(@Param('attemptId') attemptId: string) {
    return this.grading.forAttempt(attemptId);
  }

  @RequirePermission('attempt:grade')
  @Patch('attempts/:attemptId/questions/:attemptQuestionId/grade')
  grade(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attemptId') attemptId: string,
    @Param('attemptQuestionId') attemptQuestionId: string,
    @Body() body: AdminGradeAnswerDto,
  ) {
    return this.grading.grade(attemptId, attemptQuestionId, body, user.id);
  }
}
