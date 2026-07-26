import { SectionCreateSchema, SectionUpdateSchema } from '@ayman/contracts/content';
import { createZodDto } from 'nestjs-zod';

export class CreateSectionDto extends createZodDto(SectionCreateSchema) {}
export class UpdateSectionDto extends createZodDto(SectionUpdateSchema) {}
