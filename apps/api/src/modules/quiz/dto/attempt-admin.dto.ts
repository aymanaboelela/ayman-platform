import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  AdminAttemptListQuerySchema,
  AdminAttemptsOverviewQuerySchema,
} from '@ayman/contracts/admin/attempts';

export const ReopenAttemptSchema = z.object({ extraSeconds: z.number().int().min(0).default(0) }).strict();
export class ReopenAttemptDto extends createZodDto(ReopenAttemptSchema) {}

export const GrantExtraTimeSchema = z.object({ seconds: z.number().int().positive() }).strict();
export class GrantExtraTimeDto extends createZodDto(GrantExtraTimeSchema) {}

/**
 * The two READ queries behind «محاولات الطلاب». Both wrap the shared schema
 * from `@ayman/contracts/admin/attempts` and add nothing, so the screen that
 * builds the URL and the API that reads it validate identically.
 *
 * Through the DTO and the class-level `ZodValidationPipe`, never a raw
 * `@Query('x')` string: `sort` reaches an ORDER BY and the ids reach `uuid`
 * columns, and a value that skipped the schema would answer a 500 from
 * Postgres where a 400 belongs.
 */
export class AdminAttemptListQueryDto extends createZodDto(AdminAttemptListQuerySchema) {}
export class AdminAttemptsOverviewQueryDto extends createZodDto(AdminAttemptsOverviewQuerySchema) {}
