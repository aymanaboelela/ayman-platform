import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { WhatsappDeviceService } from '../marketing/whatsapp-device.service';
import { PasswordResetController } from './password-reset.controller';
import { PasswordResetService } from './password-reset.service';

/**
 * «نسيت كلمة السر».
 *
 * `WhatsappDeviceService` is provided here rather than imported from
 * `MarketingModule`, for the reason `AutoOutreachModule` gives: that module
 * drags in the campaign runner and its Redis, and this one only needs the
 * stateless client that talks to the sidecar.
 */
@Module({
  imports: [AuditModule],
  controllers: [PasswordResetController],
  providers: [PasswordResetService, WhatsappDeviceService],
})
export class PasswordResetModule {}
