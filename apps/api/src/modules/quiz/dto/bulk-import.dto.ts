import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const BulkImportSchema = z
  .object({
    categoryId: z.string().min(1),
    // 200 KB is roughly 2,000 questions — far past any real paste, and small
    // enough that the parser can never be turned into a CPU sink.
    text: z.string().min(1).max(200_000),
  })
  .strict();

export class BulkImportDto extends createZodDto(BulkImportSchema) {}
