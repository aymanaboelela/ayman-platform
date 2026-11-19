import { Module } from '@nestjs/common';
import { AcquisitionController } from './acquisition.controller';
import { AdminAcquisitionController } from './admin-acquisition.controller';
import { AcquisitionService } from './acquisition.service';

/**
 * «الحساب ده جه منين» — the first ad link an account arrived through, and the
 * report that reads them back per campaign. Prisma only: nothing here sends,
 * notifies or moves money.
 */
@Module({
  controllers: [AcquisitionController, AdminAcquisitionController],
  providers: [AcquisitionService],
})
export class AcquisitionModule {}
