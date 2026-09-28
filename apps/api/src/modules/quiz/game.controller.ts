import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, StreamableFile, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type { GameAnswerResult, GameHub, GameLifelineResult, GameRound } from '@ayman/contracts/quiz/game';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { GameAnswerDto, GameLifelineDto, GameRoundQueryDto } from './dto/game-answer.dto';
import { GameService } from './game.service';
import { GameVoiceService } from './game-voice.service';
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
  constructor(
    private readonly game: GameService,
    private readonly voice: GameVoiceService,
  ) {}

  /** صفحة الألعاب: الكورسات اللي فيها أسئلة، وكام سؤال في كل مستوى. */
  @Get('hub')
  hub(@CurrentUser() user: AuthenticatedUser): Promise<GameHub> {
    return this.game.hub(user.id);
  }

  /** الأسئلة من غير أي علامة على الصح — `@NoAnswerLeak()` بيتأكد. */
  @NoAnswerLeak()
  @UsePipes(ZodValidationPipe)
  @Get('round')
  round(@CurrentUser() user: AuthenticatedUser, @Query() query: GameRoundQueryDto): Promise<GameRound> {
    return this.game.round(user.id, query);
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

  /**
   * «حذف إجابتين» و«اسأل الجمهور». زي `answer` بيتكلّم عن الصح (غلطين يختفوا،
   * أو نسب الجمهور)، فمش `@NoAnswerLeak()` — وبس على سؤال في بنك الطالب.
   */
  @UsePipes(ZodValidationPipe)
  @HttpCode(200)
  @Post('lifeline')
  lifeline(@CurrentUser() user: AuthenticatedUser, @Body() body: GameLifelineDto): Promise<GameLifelineResult> {
    return this.game.lifeline(user.id, body);
  }

  /**
   * صوت قطعة من السؤال (`stem`، id اختيار، أو `letter-<n>`) — MP3. 404 لو
   * الستاك مالوش مفتاح Azure، والمتصفح ساعتها بيقرا بصوته. متكاش عند
   * المتصفح أسبوع: نفس السؤال بنفس النص = نفس الصوت.
   */
  @Get('voice/:questionId/:part')
  @Header('Content-Type', 'audio/mpeg')
  @Header('Cache-Control', 'private, max-age=604800, immutable')
  async clip(
    @CurrentUser() user: AuthenticatedUser,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Param('part') part: string,
  ): Promise<StreamableFile> {
    return new StreamableFile(await this.voice.clip(user.id, questionId, part));
  }
}
