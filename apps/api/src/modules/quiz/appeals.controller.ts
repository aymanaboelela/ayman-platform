import { Body, Controller, Get, Param, Patch, Post, Query, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type { AppealStatus } from '../../generated/prisma/enums';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AppealsService } from './appeals.service';
import { OpenAppealDto, ResolveAppealDto } from './dto/appeal.dto';

/** The student-facing half — opening a تظلم on one's own graded question,
 *  and checking which of an attempt's own questions already have one open
 *  (the review screen's appeal button needs this to render
 *  `copy.appeal.alreadyOpen` instead of double-submitting). */
@Controller('quiz')
@RequirePermission('appeal:create')
@UsePipes(ZodValidationPipe)
export class AppealsController {
  constructor(private readonly appeals: AppealsService) {}

  @Post('attempt-questions/:id/appeals')
  async open(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') attemptQuestionId: string,
    @Body() body: OpenAppealDto,
  ) {
    return { id: await this.appeals.open(user.id, attemptQuestionId, body.note) };
  }

  @Get('attempts/:attemptId/appeals')
  async mine(@CurrentUser() user: AuthenticatedUser, @Param('attemptId') attemptId: string) {
    return this.appeals.listForStudent(user.id, attemptId);
  }
}

/**
 * RECONCILED — these two routes are the ONLY admin appeal endpoints in the
 * product (Plan 6 Task 11's draft duplicated them in a second module; that
 * module is removed from Plan 6). Resolution is a PATCH on the resource, not
 * a POST to a verb, and it is idempotent — resolving an already-resolved
 * appeal returns 409 (`AppealsService.resolve`'s own check).
 */
@Controller('admin/appeals')
@UsePipes(ZodValidationPipe)
export class AdminAppealsController {
  constructor(private readonly appeals: AppealsService) {}

  @RequirePermission('appeal:read')
  @Get()
  list(@Query('status') status?: AppealStatus, @Query('take') take = '50', @Query('skip') skip = '0') {
    return this.appeals.listForAdmin({
      status,
      take: Math.min(Number(take) || 50, 200),
      skip: Number(skip) || 0,
    });
  }

  @RequirePermission('appeal:resolve')
  @Patch(':id')
  async resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') appealId: string,
    @Body() body: ResolveAppealDto,
  ) {
    await this.appeals.resolve(user.id, appealId, body);
    return this.appeals.getForAdmin(appealId);
  }
}
