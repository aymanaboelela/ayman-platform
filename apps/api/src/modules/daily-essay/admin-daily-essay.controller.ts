import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UsePipes,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import {
  EssayQueueFilterSchema,
  EssayScheduleFilterSchema,
  type AdminEssay,
  type AdminEssaySchedule,
  type AdminEssaySubmissionDetail,
  type AdminEssaySubmissionRow,
  type EssayPendingCount,
} from '@ayman/contracts/daily-essay';
import { ListQuerySchema, type ListResponse } from '@ayman/contracts/admin/list';
import { z } from '@ayman/contracts/zod';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { parseRequest } from '../../common/http/parse-request';
import { sendImage } from '../homework/homework.controller';
import { MediaService } from '../media/media.service';
import { CreateDailyEssaysDto, MarkDailyEssayDto, UpdateDailyEssayDto } from './daily-essay.dto';
import { DailyEssayService } from './daily-essay.service';

/**
 * «السؤال المقالي اليومي», the teacher's half — the schedule and the marking.
 *
 * Three existing permissions rather than three new ones, each for the act it
 * already names: `lesson:write` writes the questions (it is what sets a
 * lecture's homework), `homework:read` sees what students handed in, and
 * `homework:review` puts a mark on it — which, here as there, also deletes the
 * photographs. So a marker who may correct homework may correct these, and
 * nobody gains a new power by this feature being switched on.
 */
@RequireFeature('dailyEssay')
@Controller('admin/daily-essays')
export class AdminDailyEssayController {
  constructor(
    private readonly essays: DailyEssayService,
    private readonly media: MediaService,
  ) {}

  /* ── marking ─────────────────────────────────────────────────────────
   * ⚠️ Every static segment is declared BEFORE `:id` at the bottom: Nest
   * matches in declaration order and `:id` swallows one segment.
   */

  @RequirePermission('homework:read')
  @Get('submissions/pending-count')
  async pendingCount(): Promise<EssayPendingCount> {
    return { pending: await this.essays.pendingCount() };
  }

  @RequirePermission('homework:read')
  @Get('submissions')
  queue(
    @Query('filter') filter?: string,
    @Query('essayId') essayId?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ): Promise<ListResponse<AdminEssaySubmissionRow>> {
    // `parseRequest`, not `.parse()`: a ZodError is not an HttpException, so
    // bad client input would otherwise be a 500.
    const parsedFilter = parseRequest(EssayQueueFilterSchema, filter, 'filter');
    const list = parseRequest(ListQuerySchema, { page, perPage }, 'list query');
    const parsedEssay = parseRequest(z.uuid().optional(), essayId || undefined, 'essayId');
    return this.essays.queue(parsedFilter, parsedEssay, list.perPage, (list.page - 1) * list.perPage);
  }

  @RequirePermission('homework:read')
  @Get('submissions/:id')
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<AdminEssaySubmissionDetail> {
    return this.essays.detail(id);
  }

  /**
   * 204 — there is nothing useful to hand back, the screen moves to the next
   * answer. ⚠️ A client calling this must use a void helper: one that parses
   * the body would throw AFTER the student had been marked and told.
   */
  @RequirePermission('homework:review')
  @UsePipes(ZodValidationPipe)
  @Post('submissions/:id/mark')
  @HttpCode(204)
  mark(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: MarkDailyEssayDto,
  ): Promise<void> {
    return this.essays.mark(user.id, id, body);
  }

  @RequirePermission('homework:read')
  @Get('images/:imageId')
  async image(
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Res() response: Response,
  ): Promise<void> {
    const image = await this.essays.adminImage(imageId);
    await sendImage(this.media, image, response);
  }

  /* ── the schedule ──────────────────────────────────────────────────── */

  @RequirePermission('homework:read')
  @Get()
  schedule(
    @Query('filter') filter?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ): Promise<AdminEssaySchedule> {
    const parsedFilter = parseRequest(EssayScheduleFilterSchema, filter, 'filter');
    const list = parseRequest(ListQuerySchema, { page, perPage }, 'list query');
    return this.essays.schedule(parsedFilter, list.perPage, (list.page - 1) * list.perPage);
  }

  @RequirePermission('lesson:write')
  @UsePipes(ZodValidationPipe)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateDailyEssaysDto,
  ): Promise<{ created: number; firstDay: string; lastDay: string }> {
    return this.essays.createBatch(user.id, body);
  }

  @RequirePermission('lesson:write')
  @UsePipes(ZodValidationPipe)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateDailyEssayDto,
  ): Promise<AdminEssay> {
    return this.essays.update(id, body);
  }

  /** 409 `essay_has_answers` once anybody has answered — hide it instead. */
  @RequirePermission('lesson:write')
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.essays.remove(id);
  }
}
