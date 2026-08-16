import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import {
  InboxFilterSchema,
  InboxScopeSchema,
  defaultFilterFor,
  type AdminConversationDetail,
  type AdminConversationRow,
} from '@ayman/contracts/assistant/conversation';
import { ListQuerySchema, type ListResponse } from '@ayman/contracts/admin/list';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AssistantService } from './assistant.service';
import { ReplyDto, SetReactionDto, SetStatusDto } from './assistant.dto';

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
    @Query('scope') scope?: string,
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
    const parsedScope = InboxScopeSchema.parse(scope);
    /*
     * The default depends on the HALF being asked for — see `defaultFilterFor`.
     * `InboxFilterSchema.parse(undefined)` would answer `open` for both, and an
     * outreach thread is `answered` from birth, so the sent tab would return
     * nothing at all.
     */
    const parsedFilter =
      filter === undefined ? defaultFilterFor(parsedScope) : InboxFilterSchema.parse(filter);
    const list = ListQuerySchema.parse({ page, perPage });

    return this.assistant.list(
      parsedFilter,
      parsedScope,
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

  /**
   * «ردّ بإيموجي» — WhatsApp's long-press reaction, on one message.
   *
   * `PUT`, not `POST`: setting 👍 twice leaves 👍, and the body carrying `null`
   * clears it. That is idempotent replacement of one field, which is what PUT
   * means — and it is why there is no DELETE route whose only difference from
   * this one is the verb.
   *
   * `conversation:reply` and not a permission of its own. A reaction IS a
   * reply — the smallest one — and it lands on the student's screen under his
   * name exactly as a typed answer would. A role trusted to write words there
   * is trusted to write an emoji; a role that is not must not get the emoji as
   * a loophole.
   *
   * Both ids are validated as UUIDs and both go into the WHERE (see
   * `AssistantService.setReaction`), so a message id from another student's
   * thread matches nothing rather than being reacted to.
   */
  @RequirePermission('conversation:reply')
  @UsePipes(ZodValidationPipe)
  @Put(':id/messages/:messageId/reaction')
  @HttpCode(204)
  async reaction(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() body: SetReactionDto,
  ): Promise<void> {
    await this.assistant.setReaction(id, messageId, body.reaction);
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
