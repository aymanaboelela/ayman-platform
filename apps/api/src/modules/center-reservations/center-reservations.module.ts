import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { SettingsModule } from '../admin/settings/settings.module';
import { MediaModule } from '../media/media.module';
import { CentersModule } from '../centers/centers.module';
import { AdminCenterReservationsController } from './admin-center-reservations.controller';
import { CenterPortalController } from './center-portal.controller';
import { CenterReservationsController } from './center-reservations.controller';
import { CenterReservationsService } from './center-reservations.service';

/** «حجز السناتر» — the public page, the dashboard, and the centre owner's panel. */
@Module({
  imports: [PrismaModule, AuditModule, MediaModule, SettingsModule, CentersModule],
  controllers: [CenterReservationsController, AdminCenterReservationsController, CenterPortalController],
  providers: [CenterReservationsService],
})
export class CenterReservationsModule {}
