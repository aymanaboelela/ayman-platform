import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * The entire student-facing surface. `.strict()` + no `newMark`/`status`
 * field at all — "AppealDto is .strict() and contains only { note }" is
 * itself one of the test assertions this schema exists to satisfy.
 */
export const OpenAppealSchema = z
  .object({ note: z.string().trim().min(10).max(4_000) })
  .strict();
export class OpenAppealDto extends createZodDto(OpenAppealSchema) {}

export const ResolveAppealSchema = z
  .object({
    status: z.enum(['accepted', 'rejected']),
    // Required only when accepting; validated against the question's own
    // maxMark inside the service (the schema alone cannot know that bound).
    newMark: z.number().min(0).optional(),
    resolverNote: z.string().trim().min(1).max(4_000),
  })
  .strict()
  .refine((value) => value.status !== 'accepted' || value.newMark !== undefined, {
    message: 'newMark is required when accepting an appeal',
    path: ['newMark'],
  });
export class ResolveAppealDto extends createZodDto(ResolveAppealSchema) {}
