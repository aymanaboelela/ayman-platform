import { createZodDto } from 'nestjs-zod';
import { ArenaAnswerRequestSchema, ArenaQueueRequestSchema } from '@ayman/contracts/arena';

export class ArenaQueueDto extends createZodDto(ArenaQueueRequestSchema) {}
export class ArenaAnswerDto extends createZodDto(ArenaAnswerRequestSchema) {}
