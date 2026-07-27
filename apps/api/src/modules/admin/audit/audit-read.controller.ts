import { Controller, Get, Query, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { RequirePermission } from '../../../auth/decorators/require-permission.decorator';
import { AuditListQueryDto } from './audit-read.dto';
import { AuditReadService } from './audit-read.service';

/**
 * ⚠️ `admin/audit/verify` is registered BEFORE any future `admin/audit/:id`
 * route. There is no `:id` route in this plan (the closed `AUDIT_ACTIONS`
 * list plus filters is the whole viewer) — this ordering is defensive, so
 * that adding one later cannot silently start matching `verify` as an id.
 */
@Controller('admin/audit')
@RequirePermission('audit:read')
export class AuditReadController {
  constructor(private readonly auditRead: AuditReadService) {}

  @Get('verify')
  verify(): Promise<{ ok: true } | { ok: false; brokenAtId: string }> {
    return this.auditRead.verifyChain();
  }

  @Get()
  @UsePipes(ZodValidationPipe)
  list(@Query() query: AuditListQueryDto) {
    return this.auditRead.list(query);
  }
}
