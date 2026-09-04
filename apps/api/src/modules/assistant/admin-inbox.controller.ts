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
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import {
  InboxFilterSchema,
  type AdminConversationDetail,
  type AdminConversationRow,
  type MessageAttachmentInput,
} from '@ayman/contracts/assistant/conversation';
import { MAX_DOCUMENT_BYTES } from '@ayman/contracts/admin/media';
import { ListQuerySchema, type ListResponse } from '@ayman/contracts/admin/list';
import { parseRequest } from '../../common/http/parse-request';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AssistantService } from './assistant.service';
import { ConversationAttachmentService } from './conversation-attachment.service';
import { sendAttachment } from './serve-attachment';
import { EditMessageDto, ReplyDto, SetReactionDto, SetStatusDto } from './assistant.dto';
import type { UploadFile } from '../media/media.service';

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
  constructor(
    private readonly assistant: AssistantService,
    private readonly attachments: ConversationAttachmentService,
  ) {}

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
     *
     * `parseRequest` rather than `.parse()`: a ZodError is not an HttpException,
     * so the fail-closed filter turns bad CLIENT input into a 500 — which is
     * both the wrong status and a line in the error log nobody can act on. See
     * `common/http/parse-request.ts`.
     */
    const parsedFilter = parseRequest(InboxFilterSchema, filter, 'filter');
    const list = parseRequest(ListQuerySchema, { page, perPage }, 'list query');

    return this.assistant.list(parsedFilter, list.perPage, (list.page - 1) * list.perPage);
  }

  /**
   * Stage a file before the reply that will carry it.
   *
   * ## Declared here, above every `:id` route
   *
   * Nest matches in declaration order, and `@Post(':id/reply')` would not
   * swallow this — but `@Get(':id')` swallows anything shaped like one
   * segment, and the next static route added below it silently becomes a 400
   * from `ParseUUIDPipe`. Static first is the rule this file already follows
   * for `unread-count`.
   *
   * ## Two steps rather than one multipart reply
   *
   * The reply is JSON and the file is multipart; posting them together would
   * mean the message body arrived as a form field and lost its schema. It also
   * means a 90 MB deck can be uploaded, and shown uploading, before he has
   * finished typing — and that a failed send does not cost the upload again.
   *
   * `conversation:reply`, not `media:write`: this is the permission for
   * putting words on a student's screen, and a file is a stronger version of
   * that, not a weaker one. A role trusted to answer is trusted to attach; a
   * role that is not must not get `media:write` as a way in.
   */
  @RequirePermission('conversation:reply')
  @Post('attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      // The larger of the two ceilings, because one endpoint takes both kinds.
      // The pipelines then apply their own — 8 MiB for an image — so this is
      // the outer bound, not the rule.
      limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 },
    }),
  )
  attach(@UploadedFile() file: UploadFile): Promise<MessageAttachmentInput> {
    return this.attachments.upload(file);
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

  /**
   * The bytes of one attachment, streamed.
   *
   * No `owner` filter: `conversation:read` is the permission for reading every
   * thread, so the thread id and the message id together are the whole check —
   * and both are in the WHERE, so a message id from another conversation
   * resolves to nothing rather than to a file.
   */
  @RequirePermission('conversation:read')
  @Get(':id/messages/:messageId/attachment')
  async attachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Query('download') download: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    sendAttachment(await this.attachments.stream(id, messageId), download, response);
  }

  @RequirePermission('conversation:reply')
  @UsePipes(ZodValidationPipe)
  @Post(':id/reply')
  @HttpCode(204)
  async reply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReplyDto,
  ): Promise<void> {
    /*
     * The key came from the browser, so it is checked against the STORE before
     * it is written onto a message. The schema only proves it is shaped like a
     * key; a fabricated one that passes the pattern would otherwise become a
     * permanent bubble on a student's screen that 404s when they tap it.
     */
    if (body.attachment) await this.attachments.assertStored(body.attachment);
    await this.assistant.reply(id, body.message, body.attachment);
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

  /**
   * «أعدل عليها» — rewriting the words of a message HE sent.
   *
   * `conversation:reply` and not a permission of its own, for the same reason
   * the reaction route uses it: an edit lands on the student's screen under his
   * name exactly as the original did. A role trusted to write words there is
   * trusted to correct them; a role that is not must not get the edit as a
   * loophole.
   *
   * `author: 'admin'` is enforced in the WHERE inside the service, not here —
   * so a student's message is a 404 rather than a 403, and the route never
   * confirms that a message it will not touch exists.
   */
  @RequirePermission('conversation:reply')
  @UsePipes(ZodValidationPipe)
  @Patch(':id/messages/:messageId')
  @HttpCode(204)
  async editMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() body: EditMessageDto,
  ): Promise<void> {
    await this.assistant.editMessage(id, messageId, body.message);
  }

  /** «أمسحها». Same permission and the same ownership rule as the edit above;
   *  see `AssistantService.deleteMessage` for why there is no tombstone and why
   *  the attachment's bytes are left behind. */
  @RequirePermission('conversation:reply')
  @Delete(':id/messages/:messageId')
  @HttpCode(204)
  async deleteMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ): Promise<void> {
    await this.assistant.deleteMessage(id, messageId);
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
