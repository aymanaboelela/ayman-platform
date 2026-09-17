import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UsePipes,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import {
  HomeworkFilterSchema,
  type AdminHomeworkDetail,
  type AdminHomeworkRow,
  type HomeworkPendingCount,
} from '@ayman/contracts/homework';
import { ListQuerySchema, type ListResponse } from '@ayman/contracts/admin/list';
import { parseRequest } from '../../common/http/parse-request';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { MediaService } from '../media/media.service';
import { HomeworkService } from './homework.service';
import { sendImage } from './homework.controller';
import { ReviewHomeworkDto } from './homework.dto';

/**
 * الواجب, the instructor's half — «أشوف الواجبات ومين اللي بعت».
 *
 * `homework:read` sees the queue; `homework:review` decides it. Split for the
 * reason the permission catalogue keeps splitting things: marking writes a
 * grade, puts words on a fifteen-year-old's screen under his name, and
 * irreversibly deletes the photographs. Reading does none of those.
 */
@Controller('admin/homework')
export class AdminHomeworkController {
  constructor(
    private readonly homework: HomeworkService,
    private readonly media: MediaService,
  ) {}

  /**
   * ⚠️ Static routes first. Nest matches in declaration order, and
   * `@Get(':id')` below swallows anything shaped like one segment — the next
   * static route added under it would silently become a 400 from
   * `ParseUUIDPipe`. Same rule `AdminInboxController` follows for its own
   * `unread-count`.
   */
  @RequirePermission('homework:read')
  @Get('pending-count')
  async pendingCount(): Promise<HomeworkPendingCount> {
    return { pending: await this.homework.pendingCount() };
  }

  @RequirePermission('homework:read')
  @Get()
  list(
    @Query('filter') filter?: string,
    @Query('courseId') courseId?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ): Promise<ListResponse<AdminHomeworkRow>> {
    /*
     * `parseRequest`, not `.parse()`. A ZodError is not an HttpException, so
     * the fail-closed exception filter turns bad CLIENT input into a 500 —
     * both the wrong status and a line in the error log nobody can act on.
     * `ListQuerySchema` also clamps `perPage`, without which an admin screen
     * offers a free full-table read.
     */
    const parsedFilter = parseRequest(HomeworkFilterSchema, filter, 'filter');
    const list = parseRequest(ListQuerySchema, { page, perPage }, 'list query');

    return this.homework.adminList(
      parsedFilter,
      courseId,
      list.perPage,
      (list.page - 1) * list.perPage,
    );
  }

  /**
   * The page itself, gated by permission rather than by an unguessable key —
   * see `HOMEWORK_KEY_PATTERN` for why these never go through the public media
   * route. Streamed, not buffered.
   */
  @RequirePermission('homework:read')
  @Get('images/:imageId')
  async image(
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Res() response: Response,
  ): Promise<void> {
    const image = await this.homework.adminImage(imageId);
    await sendImage(this.media, image, response);
  }

  /**
   * ⚠️ AFTER `images/:imageId` above, and that ordering is load-bearing: this
   * pattern matches ONE segment, so declared first it would capture `images`
   * as an `:id` and answer a 400 from `ParseUUIDPipe` for every page the
   * review screen tried to load.
   */
  @RequirePermission('homework:read')
  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<AdminHomeworkDetail> {
    return this.homework.adminDetail(id);
  }

  /**
   * «مقبول» / «فكّر أكتر وابعته تاني».
   *
   * 204, because there is nothing useful to hand back: the screen navigates to
   * the next submission, and the row it just changed is re-read by the list.
   * ⚠️ A client calling this must use a void helper — `adminSend` parses the
   * body and would throw AFTER the student had already been marked and told.
   */
  @RequirePermission('homework:review')
  @UsePipes(ZodValidationPipe)
  @Post(':id/review')
  @HttpCode(204)
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ReviewHomeworkDto,
  ): Promise<void> {
    return this.homework.review(user.id, id, body);
  }
}
