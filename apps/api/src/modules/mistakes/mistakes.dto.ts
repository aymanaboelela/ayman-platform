import { createZodDto } from 'nestjs-zod';
import { MistakeAnswerRequestSchema } from '@ayman/contracts/mistakes';

export class MistakeAnswerDto extends createZodDto(MistakeAnswerRequestSchema) {}
