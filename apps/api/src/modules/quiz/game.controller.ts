import { Body, Controller, Get, HttpCode, Post, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type { GameAnswerResult, GameRound } from '@ayman/contracts/quiz/game';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { GameAnswerDto } from './dto/game-answer.dto';
import { GameService } from './game.service';
import { NoAnswerLeak } from './interceptors/no-answer-leak.decorator';

/**
 * «تحدّي الأسئلة» — تحت `me` زي `/api/me/quizzes`: مفيش id طالب في الرابط،
 * والهوية من السيشن بس.
 *
 * `quiz:read` لأن اللعبة بتقرا أسئلة كويزات الطالب اللي خلصت — نفس سؤال
 * «نتائجي». و`quizGame` مقفولة افتراضيًا على أي ستاك غير أيمن
 * (`entitlements.ts`).
 */
@Controller('me/game')
@RequireFeature('quizGame')
@RequirePermission('quiz:read')
export class GameController {
  constructor(private readonly game: GameService) {}

  /** الأسئلة من غير أي علامة على الصح — `@NoAnswerLeak()` بيتأكد. */
  @NoAnswerLeak()
  @Get('round')
  round(@CurrentUser() user: AuthenticatedUser): Promise<GameRound> {
    return this.game.round(user.id);
  }

  /**
   * سؤال واحد. مش `@NoAnswerLeak()` عن قصد: ده الراوت الوحيد في اللعبة اللي
   * شغلته يقول الصح — بعد الإجابة، وعلى سؤال المراجعة كانت هتقوله أصلًا.
   */
  @UsePipes(ZodValidationPipe)
  @HttpCode(200)
  @Post('answer')
  answer(@CurrentUser() user: AuthenticatedUser, @Body() body: GameAnswerDto): Promise<GameAnswerResult> {
    return this.game.answer(user.id, body);
  }
}
