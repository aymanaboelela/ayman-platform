import { createZodDto } from 'nestjs-zod';
import {
  GameAnswerRequestSchema,
  GameLifelineRequestSchema,
  GameRoundQuerySchema,
} from '@ayman/contracts/quiz/game';

export class GameAnswerDto extends createZodDto(GameAnswerRequestSchema) {}
export class GameLifelineDto extends createZodDto(GameLifelineRequestSchema) {}
export class GameRoundQueryDto extends createZodDto(GameRoundQuerySchema) {}
