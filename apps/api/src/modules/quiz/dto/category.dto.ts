import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateCategorySchema = z.object({ name: z.string().min(1).max(200) }).strict();
export class CreateCategoryDto extends createZodDto(CreateCategorySchema) {}
