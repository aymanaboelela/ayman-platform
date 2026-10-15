import {
  AdminChangePasswordSchema,
  AdminUpdateProfileSchema,
} from '@ayman/contracts/admin/profile';
import { createZodDto } from 'nestjs-zod';

export class AdminChangePasswordDto extends createZodDto(AdminChangePasswordSchema) {}
export class AdminUpdateProfileDto extends createZodDto(AdminUpdateProfileSchema) {}
