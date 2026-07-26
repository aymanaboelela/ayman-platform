import { Module } from '@nestjs/common';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { EnrollmentController } from './enrollment.controller';
import { EntitlementService } from './entitlement.service';

@Module({
  // Plan 4: `EnrollmentModule` supplies the enriched read service this
  // controller's `GET /api/enrollments` handler now delegates to.
  imports: [EnrollmentModule],
  controllers: [EnrollmentController],
  providers: [EntitlementService],
  exports: [EntitlementService],
})
export class EntitlementModule {}
