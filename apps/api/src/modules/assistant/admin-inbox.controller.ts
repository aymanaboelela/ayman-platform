import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import {
  InboxFilterSchema,
  type AdminConversationDetail,
  type AdminConversationRow,
} from '@ayman/contracts/assistant/conversation';
import { ListQuerySchema, type ListResponse } from '@ayman/contracts/admin/list';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AssistantService } from './assistant.service';
import { ReplyDto, SetStatusDto } from './assistant.dto';

/**
 * `/api/admin/conversations` — the instructor's side.
 *
 * ## Three permissions, not one
 *
 * Reading the inbox, answering it and closing a thread are separate
 * `conversation:*` permissions even though only `admin` holds any of them
 * today. That is the point: an assistant/moderator role added later is one
 * entry in `ROLE_PERMISSIONS` — read and reply without close, say — and zero
 * changes to any route. Collapsing them into `admin:access` would make that a
 * refactor instead.
 */
@Controller('admin/conversations')
export class AdminInboxController {
  constructor(private readonly assistant: AssistantService) {}

  @RequirePermission('conversation:read')
  @Get()
  async list(
    @Query('filter') filter?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ): Promise<ListResponse<AdminConversationRow>> {
    /*
     * Parsed through the shared schemas rather than `Number(page)`.
     *
     * These land in Prisma's `take`/`skip`, where a `NaN` from junk input is a
     * driver-level error — a 500 for what is really a malformed request — and
     * an unbounded `perPage` is a free full-table read on a public-facing
     * admin screen. `ListQuerySchema` already clamps both, and it is the same
     * one every other admin list uses.
     */
    const parsedFilter = InboxFilterSchema.parse(filter);
    const list = ListQuerySchema.parse({ page, perPage });

    return this.assistant.list(
      parsedFilter,
      list.perPage,
      (list.page - 1) * list.perPage,
    );
  }

  /** Its own route: the sidebar badge renders on every admin screen and must
   *  not fetch a page of rows to show one number. */
  @RequirePermission('conversation:read')
  @Get('unread-count')
  async unread(): Promise<{ unread: number }> {
    return { unread: await this.assistant.unreadCount() };
  }

  /*
   * ⚠️ Declared AFTER `unread-count`.
   *
   * Nest matches in declaration order, and `:id` would otherwise swallow
   * `/unread-count` — which `ParseUUIDPipe` then rejects as a 400 on a route
   * that looks, from the client, like it simply stopped working.
   */
  @RequirePermission('conversation:read')
  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<AdminConversationDetail> {
    return this.assistant.detail(id);
  }

  @RequirePermission('conversation:reply')
  @UsePipes(ZodValidationPipe)
  @Post(':id/reply')
  @HttpCode(204)
  async reply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReplyDto,
  ): Promise<void> {
    await this.assistant.reply(id, body.message);
  }

  @RequirePermission('conversation:close')
  @UsePipes(ZodValidationPipe)
  @Patch(':id/status')
  @HttpCode(204)
  async status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetStatusDto,
  ): Promise<void> {
    await this.assistant.setStatus(id, body.status);
  }
}
