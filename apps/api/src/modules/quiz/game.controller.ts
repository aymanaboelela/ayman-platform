import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, StreamableFile, UsePipes } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import type {
  GameAnswerResult,
  GameFinishResult,
  GameHub,
  GameLifelineResult,
  GameRound,
} from '@ayman/contracts/quiz/game';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { GameAnswerDto, GameFinishDto, GameLifelineDto, GameRoundQueryDto, GameStartDto } from './dto/game-answer.dto';
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

  /**
   * الجولة القديمة، من غير تسجيل — لتاب اتفتح على بيلد قبل `POST rounds`.
   * الأسئلة من غير أي علامة على الصح — `@NoAnswerLeak()` بيتأكد.
   */
  @NoAnswerLeak()
  @UsePipes(ZodValidationPipe)
  @Get('round')
  round(@CurrentUser() user: AuthenticatedUser, @Query() query: GameRoundQueryDto): Promise<GameRound> {
    return this.game.round(user.id, query);
  }

  /**
   * جولة جديدة بالنطاق اللي الطالب اختاره (المنهج كله، وحدة، ولا درس)،
   * ومعاها صف في `game_sessions` — الإحصائيات، والتأكد السريع من الإجابات.
   * POST مش GET: بيكتب.
   */
  @NoAnswerLeak()
  @UsePipes(ZodValidationPipe)
  @HttpCode(200)
  @Post('rounds')
  start(@CurrentUser() user: AuthenticatedUser, @Body() body: GameStartDto): Promise<GameRound> {
    return this.game.start(user.id, body);
  }

  /**
   * آخر الجولة: النتيجة والمدة من السيرفر. النقط اللي المتصفح بيبعتها
   * (سباق/بقاء) بتتحصر بين أقل وأكتر نقط ممكنة للإجابات اللي اتصحّحت هنا.
   */
  @UsePipes(ZodValidationPipe)
  @HttpCode(200)
  @Post('sessions/:sessionId/finish')
  finish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: GameFinishDto,
  ): Promise<GameFinishResult> {
    return this.game.finish(user.id, sessionId, body);
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
  // ٩ قطع للسؤال الواحد (السؤال، وحرف ونص لكل اختيار) بتتطلب مع بعض، فـ٦٠
  // في الدقيقة الافتراضية كانت بتخلص بعد ٦ أسئلة سريعة والصوت يقع لصوت
  // المتصفح في النص. القطعة نفسها بتتكاش أسبوع، فده سقف مش باب.
  @Throttle({
    short: { limit: 30, ttl: seconds(1) },
    medium: { limit: 300, ttl: seconds(60) },
    long: { limit: 5000, ttl: seconds(3600) },
  })
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
