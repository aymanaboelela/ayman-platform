import {
  AdminHonorPinCreateSchema,
  AdminHonorPinPatchSchema,
  AdminHonorStudentQuerySchema,
} from '@ayman/contracts/admin/honor-board';
import { createZodDto } from 'nestjs-zod';

export class AdminHonorPinCreateDto extends createZodDto(AdminHonorPinCreateSchema) {}
export class AdminHonorPinPatchDto extends createZodDto(AdminHonorPinPatchSchema) {}
export class AdminHonorStudentQueryDto extends createZodDto(AdminHonorStudentQuerySchema) {}
