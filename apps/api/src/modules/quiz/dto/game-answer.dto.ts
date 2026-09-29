import { createZodDto } from 'nestjs-zod';
import {
  GameAnswerRequestSchema,
  GameFinishRequestSchema,
  GameLifelineRequestSchema,
  GameModesUpdateSchema,
  GameRoundQuerySchema,
  GameStartRequestSchema,
} from '@ayman/contracts/quiz/game';
import { GameStatsQuerySchema } from '@ayman/contracts/quiz/game-stats';

export class GameAnswerDto extends createZodDto(GameAnswerRequestSchema) {}
export class GameLifelineDto extends createZodDto(GameLifelineRequestSchema) {}
export class GameRoundQueryDto extends createZodDto(GameRoundQuerySchema) {}
export class GameStartDto extends createZodDto(GameStartRequestSchema) {}
export class GameFinishDto extends createZodDto(GameFinishRequestSchema) {}
export class GameModesUpdateDto extends createZodDto(GameModesUpdateSchema) {}
export class GameStatsQueryDto extends createZodDto(GameStatsQuerySchema) {}
