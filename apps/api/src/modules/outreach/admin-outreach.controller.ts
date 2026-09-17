import { Controller, Get, Query } from '@nestjs/common';
import { ListQuerySchema, type ListResponse } from '@ayman/contracts/admin/list';
import { parseRequest } from '../../common/http/parse-request';
import {
  OutreachLogFilterSchema,
  type OutreachLogRow,
  type OutreachPreview,
  type OutreachStats,
} from '@ayman/contracts/outreach/admin';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { OutreachLogService } from './outreach-log.service';

/**
 * `/api/admin/outreach` — read-only, and that is not an oversight.
 *
 * A system that writes messages in someone's name owes them a place to read
 * every one of them, which is what these three routes are for. What it must
 * NOT offer from the same screen is a "send to everyone" button: the four
 * triggers are the whole point — each message is caused by something a
 * particular student did — and a broadcast control would turn a personal
 * channel into a mailing list in one click. Changing WHETHER and HOW OFTEN the
 * platform speaks is done through settings, under `settings:write`, where every
 * change is audited.
 *
 * `outreach:read` rather than `conversation:read`: reading what a student asked
 * and auditing what the platform said in your name are different authorities,
 * and a support role added later should plausibly hold the first and not the
 * second. Same reasoning as every other split in `permissions.ts`.
 */
@Controller('admin/outreach')
export class AdminOutreachController {
  constructor(private readonly log: OutreachLogService) {}

  @RequirePermission('outreach:read')
  @Get()
  async list(
    @Query('filter') filter?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ): Promise<ListResponse<OutreachLogRow>> {
    // Through the shared schemas, never `Number(page)` — these land in Prisma's
    // `take`/`skip`, where a NaN is a driver-level error and an unbounded
    // `perPage` is a free full-table read. Same note as `AdminInboxController`.
    //
    // `parseRequest` rather than `.parse()`: a ZodError is not an
    // HttpException, so the fail-closed filter turns bad CLIENT input into a
    // 500. See `common/http/parse-request.ts`.
    const parsedFilter = parseRequest(OutreachLogFilterSchema, filter, 'filter');
    const list = parseRequest(ListQuerySchema, { page, perPage }, 'list query');

    return this.log.list(parsedFilter, list.perPage, (list.page - 1) * list.perPage);
  }

  /*
   * ⚠️ Both static routes are declared BEFORE any `:id` route would be, and a
   * `:id` route added later must go below them — Nest matches in declaration
   * order and would otherwise route `/stats` into it.
   */
  @RequirePermission('outreach:read')
  @Get('stats')
  stats(): Promise<OutreachStats> {
    return this.log.stats();
  }

  @RequirePermission('outreach:read')
  @Get('preview')
  preview(): Promise<OutreachPreview> {
    return this.log.preview();
  }
}
