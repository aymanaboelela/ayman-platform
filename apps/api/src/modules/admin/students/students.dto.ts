import {
  AdminGrantCreateSchema,
  AdminRoleChangeSchema,
  AdminStudentBanSchema,
  AdminStudentBulkDeleteSchema,
  AdminStudentDeleteSchema,
  AdminStudentPatchSchema,
  AdminStudentSetPasswordSchema,
  StudentListQuerySchema,
} from '@ayman/contracts/admin/students';
import { createZodDto } from 'nestjs-zod';

/**
 * One DTO per shape. `StudentListQueryDto` validates the ENTIRE `@Query()`
 * object in one pass, including the array-parameter normalisation
 * (`toArray` inside the shared schema) — reading `req.query.governorate`
 * directly would silently break the moment a filter has exactly one value.
 */
export class StudentListQueryDto extends createZodDto(StudentListQuerySchema) {}
export class AdminStudentPatchDto extends createZodDto(AdminStudentPatchSchema) {}
export class AdminStudentSetPasswordDto extends createZodDto(AdminStudentSetPasswordSchema) {}
export class AdminRoleChangeDto extends createZodDto(AdminRoleChangeSchema) {}
export class AdminGrantCreateDto extends createZodDto(AdminGrantCreateSchema) {}
export class AdminStudentBanDto extends createZodDto(AdminStudentBanSchema) {}
export class AdminStudentDeleteDto extends createZodDto(AdminStudentDeleteSchema) {}
export class AdminStudentBulkDeleteDto extends createZodDto(AdminStudentBulkDeleteSchema) {}
