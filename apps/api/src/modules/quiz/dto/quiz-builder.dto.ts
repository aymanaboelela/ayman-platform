import { QuestionTypeSchema } from '@ayman/contracts/quiz/question';
import { QuizPaperSchema, QuizSettingsSchema } from '@ayman/contracts/quiz/quiz-settings';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** The builder form and the API validate identically — this wraps Task 4's
 *  shared schema with `createZodDto`, nothing more. */
export class QuizSettingsDto extends createZodDto(QuizSettingsSchema) {}

/**
 * `paper` defaults to `original` everywhere it appears below.
 *
 * That default is load-bearing: every existing caller — and every request from
 * a build of the admin UI older than this one — keeps writing to the paper it
 * always wrote to, rather than having its slots land somewhere no student will
 * ever be served. `.strict()` means an unknown field is a 400 rather than a
 * silent drop, so a typo'd `paper` cannot quietly become `original` either.
 */
export const AddSlotSchema = z
  .object({
    bankEntryId: z.string().min(1),
    /** Omitted = "latest ready version at attempt-start time", never re-resolved once snapshotted. */
    pinnedVersion: z.number().int().positive().optional(),
    maxMark: z.number().positive(),
    paper: QuizPaperSchema.default('original'),
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
    paper: QuizPaperSchema.default('original'),
  })
  .strict();
export class AddPoolDto extends createZodDto(AddPoolSchema) {}

/**
 * Scoped to ONE paper — `slotIds` must name every slot of `paper` exactly once.
 * A list spanning both papers would renumber two independent sequences into a
 * single one, and the service rejects it.
 */
export const ReorderSlotsSchema = z
  .object({
    slotIds: z.array(z.string().min(1)).min(1),
    paper: QuizPaperSchema.default('original'),
  })
  .strict();
export class ReorderSlotsDto extends createZodDto(ReorderSlotsSchema) {}
