import { Module } from '@nestjs/common';
import { EnrollmentService } from './enrollment.service';

/**
 * No controller here on purpose. Plan 3's `EntitlementModule` already owns
 * `POST /api/courses/:courseId/enroll` and `GET /api/enrollments` — a second
 * controller in this module would register a competing route for the same
 * responsibility. `EnrollmentService` is exported so `EntitlementModule` can
 * inject it into its existing controller, and so `ProgressModule` (Task 5)
 * can depend on `ACTIVE_ENROLLMENT_STATUSES` from the same file.
 */
@Module({
  providers: [EnrollmentService],
  exports: [EnrollmentService],
})
export class EnrollmentModule {}
