import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type {
  AudiencePreview,
  CampaignDetail,
  CampaignRow,
  OptOutRow,
  RecipientRow,
  TestSendReceipt,
  TestSendResult,
  WhatsappDevice,
} from '@ayman/contracts/marketing/campaign';
import { RECIPIENT_FILTERS, type RecipientFilter } from '@ayman/contracts/marketing/campaign';
import { normalizeEgyptianPhone } from '@ayman/contracts/phone';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequireCsrf } from '../security/require-csrf.decorator';
import { AuditService } from '../../audit/audit.service';
import { CampaignService } from './campaign.service';
import { NotOnWhatsAppError, WhatsappDeviceService, type SendResult } from './whatsapp-device.service';
import {
  AudiencePreviewDto,
  CampaignCreateDto,
  CampaignPatchDto,
  OptOutCreateDto,
  TestSendDto,
} from './marketing.dto';

/**
 * What a test message says when the operator does not write one.
 *
 * It names the platform and says it is a test, because the recipient is a real
 * person whose phone just buzzed for the instructor's debugging.
 */
const DEFAULT_TEST_TEXT = 'رسالة تجربة من منصة م. أيمن أبو العلا — لو وصلتك، الرسايل شغالة تمام ✅';

/**
 * `/api/admin/marketing` — the only way into the campaign machinery.
 *
 * ## Four permissions on one controller
 *
 * Reading is `marketing:read`. Writing a draft is `marketing:write`. Starting,
 * pausing and cancelling are `marketing:send`, because pressing «ابدأ» is the
 * act that puts a message on somebody's personal phone and it is not the same
 * authority as writing one. Pairing the device is `marketing:device`, because
 * that one hands the platform the ability to speak AS the instructor from a
 * number that is his.
 *
 * Nothing but `admin` holds any of them today. The split costs nothing now
 * and is the difference between "add an assistant role" being one line and
 * being a refactor.
 *
 * ## Why the device routes live here
 *
 * The QR pairing is not a setting. It is the single most consequential button
 * on the platform, it belongs beside the campaigns it exists to serve, and
 * folding it into `/admin/settings` would put it behind `settings:write` —
 * the permission that also changes the site's phone number.
 */
@Controller('admin/marketing')
@UsePipes(ZodValidationPipe)
export class MarketingController {
  constructor(
    private readonly campaigns: CampaignService,
    private readonly device: WhatsappDeviceService,
    private readonly audit: AuditService,
  ) {}

  // ── the device ─────────────────────────────────────────────────────────

  /**
   * ⚠️ Declared BEFORE `:id`, and anything added later must go above it too —
   * Nest matches in declaration order and would otherwise route `/device`
   * into the campaign detail handler. Same note as `AdminOutreachController`.
   */
  @RequirePermission('marketing:read')
  @Get('device')
  deviceStatus(): Promise<WhatsappDevice> {
    return this.device.status();
  }

  @RequirePermission('marketing:device')
  @RequireCsrf()
  @Post('device/link')
  async link(@CurrentUser() user: AuthenticatedUser): Promise<WhatsappDevice> {
    const status = await this.device.link();
    await this.audit.record({
      action: 'whatsapp:link',
      resourceType: 'whatsapp_device',
      resourceId: null,
      outcome: 'success',
      actorUserId: user.id,
      metadata: { state: status.state },
    });
    return status;
  }

  /**
   * «ابعت رسالة تجربة» — one message to one number, and the truth about it.
   *
   * `marketing:send`, the permission that already gates starting a campaign,
   * because this puts a real message on a real stranger's phone. NOT
   * `marketing:read`.
   *
   * The number is normalised through the same parser the audience uses, so a
   * test cannot accidentally exercise a code path campaigns never take — that
   * would make a green test meaningless.
   *
   * Deliberately NOT opt-out-checked: «قف» means stop marketing to me, and a
   * test send is the instructor diagnosing his own sender against a number he
   * chose. It IS audited, for exactly that reason.
   */
  @RequirePermission('marketing:send')
  @RequireCsrf()
  @Post('device/test-send')
  async testSend(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: TestSendDto,
  ): Promise<TestSendResult> {
    const phone = normalizeEgyptianPhone(body.phone);
    if (!phone) throw new BadRequestException('الرقم ده مش رقم مصري صحيح');

    let result: SendResult;
    try {
      result = await this.device.send({ phone, text: body.text ?? DEFAULT_TEST_TEXT });
    } catch (error) {
      if (error instanceof NotOnWhatsAppError) {
        await this.audit.record({
          action: 'whatsapp:test-send',
          resourceType: 'whatsapp_device',
          resourceId: null,
          outcome: 'failure',
          actorUserId: user.id,
          metadata: { phone, reason: 'not-on-whatsapp' },
        });
        return { messageId: null, onWhatsApp: false, jid: null, serverJid: null, lid: null };
      }
      throw error;
    }

    await this.audit.record({
      action: 'whatsapp:test-send',
      resourceType: 'whatsapp_device',
      resourceId: null,
      outcome: 'success',
      actorUserId: user.id,
      // `lid` is recorded because it is the whole point of the exercise: a
      // week from now, "did that number have a LID" is the question somebody
      // will wish had been written down.
      metadata: { phone, messageId: result.messageId, lid: result.lid ?? null },
    });

    return {
      messageId: result.messageId,
      onWhatsApp: true,
      jid: result.jid ?? null,
      serverJid: result.serverJid ?? null,
      lid: result.lid ?? null,
    };
  }

  /**
   * Has that test message reached a device yet?
   *
   * `marketing:read` — this reads a status, it does not send anything. Polled
   * by the device screen for a short while after a test send.
   */
  @RequirePermission('marketing:read')
  @Get('device/test-send/:messageId')
  testSendReceipt(@Param('messageId') messageId: string): Promise<TestSendReceipt> {
    return this.device.receipt(messageId);
  }

  @RequirePermission('marketing:device')
  @RequireCsrf()
  @Post('device/unlink')
  async unlink(@CurrentUser() user: AuthenticatedUser): Promise<{ ok: true }> {
    await this.device.unlink();
    await this.audit.record({
      action: 'whatsapp:unlink',
      resourceType: 'whatsapp_device',
      resourceId: null,
      outcome: 'success',
      actorUserId: user.id,
      metadata: null,
    });
    return { ok: true };
  }

  // ── opt-outs ───────────────────────────────────────────────────────────

  @RequirePermission('marketing:read')
  @Get('opt-outs')
  optOuts(): Promise<OptOutRow[]> {
    return this.campaigns.listOptOuts();
  }

  @RequirePermission('marketing:write')
  @RequireCsrf()
  @Post('opt-outs')
  addOptOut(@Body() body: OptOutCreateDto): Promise<OptOutRow> {
    return this.campaigns.addOptOut(body.phone, body.reason);
  }

  @RequirePermission('marketing:write')
  @RequireCsrf()
  @Delete('opt-outs/:phone')
  async removeOptOut(@Param('phone') phone: string): Promise<{ ok: true }> {
    await this.campaigns.removeOptOut(phone);
    return { ok: true };
  }

  // ── campaigns ──────────────────────────────────────────────────────────

  /** How big is this audience, before anything is created. */
  @RequirePermission('marketing:write')
  @RequireCsrf()
  @Post('audience-preview')
  previewAudience(@Body() body: AudiencePreviewDto): Promise<AudiencePreview> {
    return this.campaigns.preview(body.audience, body.pacing);
  }

  @RequirePermission('marketing:read')
  @Get('campaigns')
  list(): Promise<CampaignRow[]> {
    return this.campaigns.list();
  }

  @RequirePermission('marketing:write')
  @RequireCsrf()
  @Post('campaigns')
  create(@Body() body: CampaignCreateDto, @CurrentUser() user: AuthenticatedUser): Promise<CampaignRow> {
    return this.campaigns.create(body, user.id);
  }

  @RequirePermission('marketing:read')
  @Get('campaigns/:id')
  detail(@Param('id') id: string): Promise<CampaignDetail> {
    return this.campaigns.detail(id);
  }

  @RequirePermission('marketing:read')
  @Get('campaigns/:id/recipients')
  recipients(@Param('id') id: string, @Query('status') status?: string): Promise<RecipientRow[]> {
    const parsed = RECIPIENT_FILTERS.includes(status as RecipientFilter)
      ? (status as RecipientFilter)
      : 'all';
    return this.campaigns.recipients(id, parsed);
  }

  @RequirePermission('marketing:write')
  @RequireCsrf()
  @Patch('campaigns/:id')
  patch(@Param('id') id: string, @Body() body: CampaignPatchDto): Promise<CampaignDetail> {
    return this.campaigns.patch(id, body);
  }

  @RequirePermission('marketing:send')
  @RequireCsrf()
  @Post('campaigns/:id/start')
  start(@Param('id') id: string): Promise<CampaignRow> {
    return this.campaigns.start(id);
  }

  @RequirePermission('marketing:send')
  @RequireCsrf()
  @Post('campaigns/:id/pause')
  pause(@Param('id') id: string): Promise<CampaignRow> {
    return this.campaigns.pause(id);
  }

  @RequirePermission('marketing:send')
  @RequireCsrf()
  @Post('campaigns/:id/cancel')
  cancel(@Param('id') id: string): Promise<CampaignRow> {
    return this.campaigns.cancel(id);
  }

  @RequirePermission('marketing:write')
  @RequireCsrf()
  @Delete('campaigns/:id')
  async remove(@Param('id') id: string): Promise<{ ok: true }> {
    await this.campaigns.remove(id);
    return { ok: true };
  }
}
