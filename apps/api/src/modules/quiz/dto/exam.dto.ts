import {
  AdminExamCreateSchema,
  AdminExamDuplicateSchema,
  AdminExamPatchSchema,
  AdminAttemptMarkSchema,
  AdminGradeAnswerSchema,
  GradingScopeSchema,
  GradingSortSchema,
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

/**
 * `GET /api/admin/grading-results` — «اتصحّح خلاص» و«الأوائل».
 *
 * Every field has a default, so the bare URL is a valid request: the screen's
 * first load asks for nothing and gets the ranking it should open on.
 *
 * NOT `.strict()`, unlike every write schema here. A query string is a place
 * where an unrelated parameter legitimately rides along (a `?tab=` the server
 * does not care about, anything a link carries), and 400-ing a READ over one
 * would break a bookmark rather than catch a bug.
 *
 * ⚠️ `sort` reaches an ORDER BY through a fixed map in the service. The enum
 * IS the sanitisation — nothing downstream re-validates it, and nothing may be
 * added to that map that is not in this enum.
 */
export const AdminGradingResultsQuerySchema = z.object({
  scope: GradingScopeSchema.default('all'),
  sort: GradingSortSchema.default('score'),
  /** Narrow to one exam. `uuid()` rather than a bare string: it goes into the
   *  query as a `::uuid` parameter, and a non-uuid would be a 500 from
   *  Postgres rather than the 400 a bad filter deserves. */
  lessonId: z.uuid().optional(),
  /** One CAIRO calendar day, `YYYY-MM-DD`. Validated by shape here and used
   *  as a `::date` parameter, never spliced into the SQL. */
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** `coerce`, because a query string is always text. The service clamps it
   *  again — this bound is the contract, that one is the protection. */
  limit: z.coerce.number().int().min(1).max(300).optional(),
});
export class AdminGradingResultsQueryDto extends createZodDto(AdminGradingResultsQuerySchema) {}

/** «أقيّمه» و«حطه في لوحة الشرف». See `AdminAttemptMarkSchema` for why the two
 *  live on one route and why the timestamp is the server's to write. */
export class AdminAttemptMarkDto extends createZodDto(AdminAttemptMarkSchema) {}
