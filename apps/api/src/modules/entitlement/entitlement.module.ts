import { Module } from '@nestjs/common';
import { EnrollmentController } from './enrollment.controller';
import { EntitlementService } from './entitlement.service';

@Module({
  controllers: [EnrollmentController],
  providers: [EntitlementService],
  exports: [EntitlementService],
})
export class EntitlementModule {}
