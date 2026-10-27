import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { ListQuerySchema, type ListResponse } from '@ayman/contracts/admin/list';
import { copy as bot } from '@ayman/contracts/copy/wa-bot';
import {
  BotAnswerKeySchema,
  LeadQuerySchema,
  WaChatFilterSchema,
  type BotAnswerRow,
  type BotPreview,
  type BotSettingsRead,
  type LeadList,
  type LeadRow,
  type WaChatDetail,
  type WaChatRow,
} from '@ayman/contracts/wa-bot/schemas';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { parseRequest } from '../../common/http/parse-request';
import { RequireCsrf } from '../security/require-csrf.decorator';
import { toCsv } from '../analytics/csv';
import { FRESH_CHAT, WaBotBrainService } from './wa-bot-brain.service';
import { UNKNOWN, WaBotIdentityService, chatPhone } from './wa-bot-identity.service';
import { WaBotService } from './wa-bot.service';
import { WaBotSettingsService } from './wa-bot-settings.service';
import {
  BotAnswerCreateDto,
  BotAnswerPutDto,
  BotPreviewDto,
  BotSettingsDto,
  LeadPatchDto,
  WaChatPatchDto,
  WaReplyDto,
} from './wa-bot.dto';

/**
 * `/api/admin/wa-bot` — «الرد الآلي», «المهتمين» and the WhatsApp inbox.
 *
 * ## The marketing permissions, not new ones
 *
 * Everything here is the same authority the campaigns already split four
 * ways: reading is `marketing:read`, changing what the bot says is
 * `marketing:write`, and typing a reply that leaves the instructor's number
 * is `marketing:send` — the permission that starts a campaign, because it is
 * the same act on a smaller scale. A new permission family would be a second
 * place to grant the same trust.
 *
 * ## Behind its own entitlement
 *
 * `whatsapp.bot`, off on every stack but Ayman's until the owner opens it. The
 * inbound webhook is NOT behind it — «قف» has to keep working on a stack with
 * campaigns and no bot — so the bot checks the entitlement itself before it
 * records or answers anything (`WaBotService.recordInbound`, `WaBotReplier`).
 */
@RequireFeature('whatsapp.bot')
@Controller('admin/wa-bot')
@UsePipes(ZodValidationPipe)
export class WaBotController {
  constructor(
    private readonly chats: WaBotService,
    private readonly settings: WaBotSettingsService,
    private readonly brain: WaBotBrainService,
    private readonly identity: WaBotIdentityService,
  ) {}

  // ── settings and answers ───────────────────────────────────────────────

  @RequirePermission('marketing:read')
  @Get('settings')
  async readSettings(): Promise<BotSettingsRead> {
    return { settings: await this.settings.settings(), modelAvailable: this.brain.modelAvailable };
  }

  @RequirePermission('marketing:write')
  @RequireCsrf()
  @Put('settings')
  async saveSettings(@Body() body: BotSettingsDto, @CurrentUser() user: AuthenticatedUser): Promise<BotSettingsRead> {
    return { settings: await this.settings.saveSettings(body, user.id), modelAvailable: this.brain.modelAvailable };
  }

  @RequirePermission('marketing:read')
  @Get('answers')
  answers(): Promise<BotAnswerRow[]> {
    return this.settings.rows();
  }

  @RequirePermission('marketing:write')
  @RequireCsrf()
  @Post('answers')
  createAnswer(@Body() body: BotAnswerCreateDto, @CurrentUser() user: AuthenticatedUser): Promise<BotAnswerRow> {
    return this.settings.create(body, user.id);
  }

  @RequirePermission('marketing:write')
  @RequireCsrf()
  @Put('answers/:key')
  putAnswer(
    @Param('key') key: string,
    @Body() body: BotAnswerPutDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BotAnswerRow> {
    return this.settings.put(parseRequest(BotAnswerKeySchema, key, 'answer key'), body, user.id);
  }

  @RequirePermission('marketing:write')
  @RequireCsrf()
  @Delete('answers/:key')
  async resetAnswer(@Param('key') key: string, @CurrentUser() user: AuthenticatedUser): Promise<{ ok: true }> {
    await this.settings.remove(parseRequest(BotAnswerKeySchema, key, 'answer key'), user.id);
    return { ok: true };
  }

  /**
   * «تجربة البوت» — what the bot WOULD say, sent nowhere.
   *
   * Runs the real brain against live facts, so a price edited a minute ago
   * shows up here exactly as it would on a phone. The safety rules are not
   * applied: this answers "what does it say", and «would it say it right now»
   * belongs to the chat it would be said in.
   */
  @RequirePermission('marketing:read')
  @RequireCsrf()
  @Post('preview')
  async preview(@Body() body: BotPreviewDto): Promise<BotPreview> {
    const phone = body.phone ? chatPhone(body.phone) : null;
    const who = phone ? await this.identity.identify(phone) : UNKNOWN;
    const result = await this.brain.compose({
      text: body.text,
      identity: who,
      chat: FRESH_CHAT,
      history: [],
      settings: await this.settings.settings(),
      now: new Date(),
    });
    return {
      action: result.action,
      intents: [...result.intents],
      reply: result.reply,
      reason: result.reason,
      who: who.who,
    };
  }

  // ── leads ──────────────────────────────────────────────────────────────

  @RequirePermission('marketing:read')
  @Get('leads')
  leads(
    @Query('status') status?: string,
    @Query('intent') intent?: string,
    @Query('year') year?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ): Promise<LeadList> {
    const query = parseRequest(LeadQuerySchema, clean({ status, intent, year, q }), 'lead filters');
    const list = parseRequest(ListQuerySchema, { page, perPage: perPage ?? '50' }, 'list query');
    return this.chats.leads(query, list.page, list.perPage);
  }

  /** The table on the screen, as a file. BOM + CRLF via the analytics writer. */
  @RequirePermission('marketing:read')
  @Get('leads.csv')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="leads.csv"')
  async leadsCsv(
    @Query('status') status?: string,
    @Query('intent') intent?: string,
    @Query('year') year?: string,
    @Query('q') q?: string,
  ): Promise<string> {
    const query = parseRequest(LeadQuerySchema, clean({ status, intent, year, q }), 'lead filters');
    const rows = await this.chats.leadsForExport(query);
    const intentLabel = (key: string) => (bot.labels as Record<string, string>)[key] ?? key;
    return toCsv(
      ['phone', 'whatsapp_name', 'year', 'status', 'asked_about', 'first_message', 'last_message', 'first_at', 'last_at', 'messages', 'signed_up', 'converted_at', 'notes'],
      rows.map((row) => [
        row.phone,
        row.pushName,
        row.yearLabel,
        bot.admin.statuses[row.status],
        row.intents.map(intentLabel).join(' / '),
        row.firstMessage,
        row.lastMessage,
        row.firstMessageAt,
        row.lastMessageAt,
        row.messageCount,
        row.userId ? 'yes' : 'no',
        row.convertedAt,
        row.notes,
      ]),
    );
  }

  @RequirePermission('marketing:write')
  @RequireCsrf()
  @Patch('leads/:id')
  patchLead(@Param('id', ParseUUIDPipe) id: string, @Body() body: LeadPatchDto): Promise<LeadRow> {
    return this.chats.patchLead(id, body);
  }

  // ── the inbox ──────────────────────────────────────────────────────────

  @RequirePermission('marketing:read')
  @Get('chats')
  listChats(
    @Query('filter') filter?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ): Promise<ListResponse<WaChatRow>> {
    const parsed = parseRequest(WaChatFilterSchema, filter || undefined, 'filter');
    const list = parseRequest(ListQuerySchema, { page, perPage: perPage ?? '50' }, 'list query');
    return this.chats.listChats(parsed, list.page, list.perPage);
  }

  @RequirePermission('marketing:read')
  @Get('chats/:id')
  chat(@Param('id', ParseUUIDPipe) id: string): Promise<WaChatDetail> {
    return this.chats.chatDetail(id);
  }

  @RequirePermission('marketing:send')
  @RequireCsrf()
  @Post('chats/:id/reply')
  reply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: WaReplyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WaChatDetail> {
    return this.chats.reply(id, body.text, user.id);
  }

  @RequirePermission('marketing:write')
  @RequireCsrf()
  @Patch('chats/:id')
  patchChat(@Param('id', ParseUUIDPipe) id: string, @Body() body: WaChatPatchDto): Promise<WaChatDetail> {
    return this.chats.patchChat(id, body);
  }
}

/** Empty query strings are "no filter", not a value that fails the schema. */
function clean<T extends Record<string, string | undefined>>(raw: T): Partial<T> {
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined && v !== '')) as Partial<T>;
}
