import { createZodDto } from 'nestjs-zod';
import { ArenaAnswerRequestSchema, ArenaQueueRequestSchema } from '@ayman/contracts/arena';
import { ArenaChallengeCreateSchema } from '@ayman/contracts/arena-challenges';

export class ArenaQueueDto extends createZodDto(ArenaQueueRequestSchema) {}
export class ArenaAnswerDto extends createZodDto(ArenaAnswerRequestSchema) {}
export class ArenaChallengeCreateDto extends createZodDto(ArenaChallengeCreateSchema) {}
