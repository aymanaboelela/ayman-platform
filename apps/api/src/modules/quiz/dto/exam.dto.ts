import {
  AdminExamCreateSchema,
  AdminExamDuplicateSchema,
  AdminExamPatchSchema,
  AdminGradeAnswerSchema,
} from '@ayman/contracts/admin/exams';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * The admin form and the API validate identically — every class here wraps the
 * shared schema from `@ayman/contracts/admin/exams` and adds nothing.
 *
 * ⚠️ `AdminExamPatchSchema` is written out by hand as an all-optional object in
 * contracts rather than derived with `.partial()`. `.partial()` keeps every
 * `.default()`, so a PATCH that only renamed an exam would also silently write
 * `gradeOutOf: 100` and `passPercent: 70` over whatever was set — the exact
 * mechanism that once unpublished a lesson in this repo on a rename.
 */
export class AdminExamCreateDto extends createZodDto(AdminExamCreateSchema) {}
export class AdminExamPatchDto extends createZodDto(AdminExamPatchSchema) {}
export class AdminExamDuplicateDto extends createZodDto(AdminExamDuplicateSchema) {}
export class AdminGradeAnswerDto extends createZodDto(AdminGradeAnswerSchema) {}

/** Publish and unpublish are one route with a boolean rather than two, because
 *  they are one decision made twice. `.strict()` so a client that meant to
 *  PATCH settings and hit this route gets a 400 rather than an unpublish. */
export const ExamPublishSchema = z.object({ published: z.boolean() }).strict();
export class ExamPublishDto extends createZodDto(ExamPublishSchema) {}
