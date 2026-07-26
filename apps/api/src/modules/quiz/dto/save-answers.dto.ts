import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * The learner response shape. There is no `fraction`, no `mark`, no `state`,
 * no `deadlineAt` — and `.strict()` means sending one is a 400, not a silently
 * ignored field. This DTO is the entire surface a student can write to during
 * an attempt.
 */
export const AnswerResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('choice'), optionIds: z.array(z.string().min(1)).max(50) }).strict(),
  z.object({ kind: z.literal('text'), text: z.string().max(20_000) }).strict(),
]);

export const SaveAnswersSchema = z
  .object({
    attemptToken: z.string().uuid(),
    /** Monotonic per-tab counter; a lower seq than the stored one is ignored. */
    seq: z.number().int().min(1),
    answers: z
      .array(
        z
          .object({
            slotPosition: z.number().int().min(0),
            response: AnswerResponseSchema.nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();

export const FlagSchema = z
  .object({
    attemptToken: z.string().uuid(),
    slotPosition: z.number().int().min(0),
    flagged: z.boolean(),
  })
  .strict();

/**
 * Carries only `attemptToken` — the entire submit request body. A hostile
 * client attaching its own `{ score: 100 }` or `{ submittedAt: null }` is a
 * 400 from `.strict()`, and even if it were not, nothing downstream ever
 * reads a grade off this DTO — `AttemptService.submit` always grades from a
 * fresh database read (Global Constraint — replay/mass-assignment).
 */
export const SubmitSchema = z.object({ attemptToken: z.string().uuid() }).strict();

export class SaveAnswersDto extends createZodDto(SaveAnswersSchema) {}
export class FlagDto extends createZodDto(FlagSchema) {}
export class SubmitDto extends createZodDto(SubmitSchema) {}
