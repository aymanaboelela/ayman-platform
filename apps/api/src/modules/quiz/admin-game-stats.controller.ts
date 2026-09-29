import { Controller, Get, Param, Query, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type { GameStats, StudentGameSummary } from '@ayman/contracts/quiz/game-stats';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { GameStatsQueryDto } from './dto/game-answer.dto';
import { GameStatsService } from './game-stats.service';

/**
 * «إحصائيات الألعاب». نفس صلاحية التحليلات (`analytics:read`) — مين بيلعب
 * وبيقعد قد إيه سؤال عن الطلبة، زي «الفيديوهات» — ونفس فيتشر الألعاب.
 */
@Controller('admin/game-stats')
@RequireFeature('quizGame')
@RequirePermission('analytics:read')
export class AdminGameStatsController {
  constructor(private readonly stats: GameStatsService) {}

  @UsePipes(ZodValidationPipe)
  @Get()
  overview(@Query() query: GameStatsQueryDto): Promise<GameStats> {
    return this.stats.stats(query);
  }

  /**
   * طالب واحد. الـid بتاع better-auth (nanoid) مش uuid، فمن غير
   * `ParseUUIDPipe` — طالب مش موجود بيرجع أصفار، مش حاجة تتسرّب.
   */
  @Get('students/:userId')
  student(@Param('userId') userId: string): Promise<StudentGameSummary> {
    return this.stats.student(userId);
  }
}
