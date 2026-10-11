import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const BulkImportSchema = z
  .object({
    categoryId: z.string().min(1),
    // 200 KB is roughly 2,000 questions — far past any real paste, and small
    // enough that the parser can never be turned into a CPU sink.
    text: z.string().min(1).max(200_000),
    /**
     * «التحديات»: every pasted question is linked to this lesson
     * (`QuestionBankEntry.lessonId`) unless its own block says `LESSON:`.
     * Optional — a paste into an ordinary category links nothing.
     */
    lessonId: z.uuid().optional(),
    /**
     * `draft` keeps the whole paste out of every quiz picker, game and
     * challenge until each question is published from the bank — what the
     * owner wants for generated variant wordings he has not read yet.
     * Defaults to `ready`, the behaviour this endpoint always had.
     */
    status: z.enum(['ready', 'draft']).optional(),
  })
  .strict();

export class BulkImportDto extends createZodDto(BulkImportSchema) {}
