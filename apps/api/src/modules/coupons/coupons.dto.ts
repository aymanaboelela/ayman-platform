import { createZodDto } from 'nestjs-zod';
import {
  AdminCouponCreateSchema,
  AdminCouponQuerySchema,
  AdminCouponUpdateSchema,
} from '@ayman/contracts/admin/coupons';

export class AdminCouponCreateDto extends createZodDto(AdminCouponCreateSchema) {}
export class AdminCouponUpdateDto extends createZodDto(AdminCouponUpdateSchema) {}
export class AdminCouponQueryDto extends createZodDto(AdminCouponQuerySchema) {}
