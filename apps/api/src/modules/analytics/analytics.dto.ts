import { STUDENT_ANALYTICS_SORTS } from '@ayman/contracts/admin/analytics';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

function toArray(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

const optionalUuid = z
  .string()
  .uuid()
  .optional()
  .transform((value) => value ?? null);

/** The window the daily series covers. A closed list rather than a number:
 *  `?days=100000` is a full-table scan an admin can trigger from the URL bar. */
export const OverviewQuerySchema = z.object({
  days: z.coerce.number().int().refine((n) => [7, 30, 90, 365].includes(n)).default(30),
  courseId: optionalUuid,
});
export class OverviewQueryDto extends createZodDto(OverviewQuerySchema) {}

export const LessonAnalyticsQuerySchema = z.object({ courseId: optionalUuid });
export class LessonAnalyticsQueryDto extends createZodDto(LessonAnalyticsQuerySchema) {}

export const StudentAnalyticsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(200).default(25),
  q: z.string().max(120).default(''),
  sort: z.enum(STUDENT_ANALYTICS_SORTS).default('lastActiveAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  year: z.preprocess(toArray, z.array(z.coerce.number().int().min(1).max(3))).default([]),
  courseId: optionalUuid,
});
export class StudentAnalyticsQueryDto extends createZodDto(StudentAnalyticsQuerySchema) {}
