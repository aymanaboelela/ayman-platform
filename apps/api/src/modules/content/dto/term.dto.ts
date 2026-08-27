import { TermCreateSchema, TermSetOpenSchema, TermUpdateSchema } from '@ayman/contracts/content';
import { createZodDto } from 'nestjs-zod';

export class CreateTermDto extends createZodDto(TermCreateSchema) {}
export class UpdateTermDto extends createZodDto(TermUpdateSchema) {}
export class SetTermOpenDto extends createZodDto(TermSetOpenSchema) {}
