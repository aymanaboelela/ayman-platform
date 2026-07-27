import {
  AdminRoleChangeSchema,
  AdminStudentPatchSchema,
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
export class AdminRoleChangeDto extends createZodDto(AdminRoleChangeSchema) {}
