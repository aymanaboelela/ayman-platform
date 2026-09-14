import { createZodDto } from 'nestjs-zod';
import { RoleGrantsWriteSchema } from '@ayman/contracts/admin/roles';

export class RoleGrantsWriteDto extends createZodDto(RoleGrantsWriteSchema) {}
