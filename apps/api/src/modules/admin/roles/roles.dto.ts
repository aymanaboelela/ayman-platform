import { createZodDto } from 'nestjs-zod';
import { RoleGrantsWriteSchema, UserPermissionsWriteSchema } from '@ayman/contracts/admin/roles';

export class RoleGrantsWriteDto extends createZodDto(RoleGrantsWriteSchema) {}

export class UserPermissionsWriteDto extends createZodDto(UserPermissionsWriteSchema) {}
