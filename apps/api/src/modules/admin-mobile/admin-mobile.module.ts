import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MarketingModule } from '../marketing/marketing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { AdminMobileController } from './admin-mobile.controller';
import { AdminMobileService } from './admin-mobile.service';

@Module({
  imports: [PrismaModule, NotificationsModule, PaymentsModule, MarketingModule],
  controllers: [AdminMobileController],
  providers: [AdminMobileService],
})
export class AdminMobileModule {}
