import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminCouponsController } from './admin-coupons.controller';
import { CouponsService } from './coupons.service';

/**
 * «كوبونات الخصم» — the admin screen only. The student's half (the quote and
 * the use a claim spends) lives on `PaymentsController` / `PaymentsService`
 * through `coupon-ledger.ts`, the way the wallet's money moves through
 * `wallet-ledger.ts`: no module import either way.
 */
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [AdminCouponsController],
  providers: [CouponsService],
})
export class CouponsModule {}
