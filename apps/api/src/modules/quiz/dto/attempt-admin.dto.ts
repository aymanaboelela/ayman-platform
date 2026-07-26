import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ReopenAttemptSchema = z.object({ extraSeconds: z.number().int().min(0).default(0) }).strict();
export class ReopenAttemptDto extends createZodDto(ReopenAttemptSchema) {}

export const GrantExtraTimeSchema = z.object({ seconds: z.number().int().positive() }).strict();
export class GrantExtraTimeDto extends createZodDto(GrantExtraTimeSchema) {}
