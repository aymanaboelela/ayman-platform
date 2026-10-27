import { createZodDto } from 'nestjs-zod';
import {
  AdminReferralQuerySchema,
  ReferralProgramSchema,
  VoidReferralSchema,
} from '@ayman/contracts/admin/referrals';

export class ReferralProgramDto extends createZodDto(ReferralProgramSchema) {}
export class VoidReferralDto extends createZodDto(VoidReferralSchema) {}
export class AdminReferralQueryDto extends createZodDto(AdminReferralQuerySchema) {}
