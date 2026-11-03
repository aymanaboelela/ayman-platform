import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  WaContactsStartSchema,
  type WaContactsStatus,
} from '@ayman/contracts/marketing/wa-contacts';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { parseRequest } from '../../common/http/parse-request';
import { AuditService } from '../../audit/audit.service';
import { RequireCsrf } from '../security/require-csrf.decorator';
import { WaContactsService } from './wa-contacts.service';

/**
 * `/api/admin/marketing/wa-contacts` — «احفظهم في واتساب».
 *
 * Reading is `marketing:read`, like the device page. Starting and stopping
 * are `marketing:device`: a run writes into the linked number's own WhatsApp
 * account thousands of times, which is the authority pairing that number
 * already is — not the authority to write a campaign.
 *
 * `@RequireFeature('whatsapp.contacts')` — on for Ayman, off on every other
 * stack until the owner opens it (`new-features-ayman-first-openable`).
 */
@Controller('admin/marketing/wa-contacts')
@RequireFeature('whatsapp.contacts')
export class WaContactsController {
  constructor(
    private readonly contacts: WaContactsService,
    private readonly audit: AuditService,
  ) {}

  @RequirePermission('marketing:read')
  @Get()
  status(): Promise<WaContactsStatus> {
    return this.contacts.status();
  }

  @RequirePermission('marketing:device')
  @RequireCsrf()
  @Post('start')
  async start(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<WaContactsStatus> {
    const input = parseRequest(WaContactsStartSchema, body ?? {}, 'start');
    const { queued } = await this.contacts.start(input, user.id);
    await this.audit.record({
      action: 'whatsapp:contacts-start',
      resourceType: 'whatsapp_device',
      resourceId: null,
      outcome: 'success',
      actorUserId: user.id,
      metadata: { limit: input.limit, queued },
    });
    return this.contacts.status();
  }

  @RequirePermission('marketing:device')
  @RequireCsrf()
  @Post('pause')
  async pause(@CurrentUser() user: AuthenticatedUser): Promise<WaContactsStatus> {
    await this.contacts.pause();
    await this.audit.record({
      action: 'whatsapp:contacts-pause',
      resourceType: 'whatsapp_device',
      resourceId: null,
      outcome: 'success',
      actorUserId: user.id,
      metadata: {},
    });
    return this.contacts.status();
  }
}
