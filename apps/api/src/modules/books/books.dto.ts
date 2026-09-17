import { AdminBookCreateSchema, AdminBookPatchSchema } from '@ayman/contracts/admin/books';
import { createZodDto } from 'nestjs-zod';

export class AdminBookCreateDto extends createZodDto(AdminBookCreateSchema) {}
export class AdminBookPatchDto extends createZodDto(AdminBookPatchSchema) {}
