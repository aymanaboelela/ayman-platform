import { createZodDto } from 'nestjs-zod';
import { GameAnswerRequestSchema } from '@ayman/contracts/quiz/game';

export class GameAnswerDto extends createZodDto(GameAnswerRequestSchema) {}
