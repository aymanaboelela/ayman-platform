import { QuestionTypeSchema } from '@ayman/contracts/quiz/question';
import { QuizSettingsSchema } from '@ayman/contracts/quiz/quiz-settings';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** The builder form and the API validate identically — this wraps Task 4's
 *  shared schema with `createZodDto`, nothing more. */
export class QuizSettingsDto extends createZodDto(QuizSettingsSchema) {}

export const AddSlotSchema = z
  .object({
    bankEntryId: z.string().min(1),
    /** Omitted = "latest ready version at attempt-start time", never re-resolved once snapshotted. */
    pinnedVersion: z.number().int().positive().optional(),
    maxMark: z.number().positive(),
  })
  .strict();
export class AddSlotDto extends createZodDto(AddSlotSchema) {}

export const SourceFilterSchema = z
  .object({
    categoryIds: z.array(z.string().min(1)).optional(),
    types: z.array(QuestionTypeSchema).optional(),
  })
  .strict();

export const AddPoolSchema = z
  .object({
    name: z.string().min(1),
    pickCount: z.number().int().positive(),
    pointsPerQuestion: z.number().positive(),
    sourceFilter: SourceFilterSchema,
  })
  .strict();
export class AddPoolDto extends createZodDto(AddPoolSchema) {}

export const ReorderSlotsSchema = z.object({ slotIds: z.array(z.string().min(1)).min(1) }).strict();
export class ReorderSlotsDto extends createZodDto(ReorderSlotsSchema) {}
