import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  InternalServerErrorException,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import type { ArenaAnswerResult, ArenaBeat, ArenaFrame, ArenaLobby, ArenaView } from '@ayman/contracts/arena';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { NoAnswerLeak } from '../quiz/interceptors/no-answer-leak.decorator';
import { collectKeysDeep, FORBIDDEN_ANSWER_KEYS } from '../quiz/serializers/learner.serializer';
import { ArenaOpenGuard } from './arena-gate.service';
import { ArenaAnswerDto, ArenaQueueDto } from './arena.dto';
import { ArenaService } from './arena.service';

/**
 * كل كام ثانية فريم `ping` على الستريم. أقل بكتير من الـ١٠٠ ثانية بتاعة
 * Cloudflare، وكفاية المتصفح يعرف إن الخط مات لو عدّت ١٢ ثانية من غير حاجة
 * (`use-arena-stream.ts`). وهو نفسه اللي بيجدّد عدّاد «الستريم مفتوح».
 */
const PING_MS = 5_000;
/** سقف على ستريم واحد — EventSource بيعيد لوحده، والماتش أقصر من كده بكتير. */
const MAX_STREAM_MS = 30 * 60_000;
/** كل تاب ستريم. أربعة كفاية لأي طالب؛ الخامس ٤٢٩. */
const MAX_STREAMS_PER_USER = 4;
const openStreams = new Map<string, number>();

/**
 * «ساحة التحدي» — `/api/me/arena`، تحت `me` زي الألعاب: مفيش id طالب في
 * الرابط، والهوية من السيشن بس. `quiz:read` زي `/api/me/game` (الماتش بيقرا
 * أسئلة الكويزات)، و`ArenaOpenGuard` = فلاج `arena.enabled`.
 *
 * ## ليه SSE + POST ومش WebSocket
 *
 * نفس حجة `/api/me/notifications/stream`: الستريم HTTP عادي، فبيعدّي من نفس
 * Cloudflare وTraefik وrewrite بتاع Next، بنفس كوكي `__Host-` ونفس الجاردات،
 * من غير CORS ولا مسار upgrade ولا هاندشيك توثيق تاني. الاتجاه التاني
 * (الإجابة، النبضة) طلبات POST قصيرة بـCSRF زي أي حاجة في المنصة — وده
 * بالظبط اللي محتاجينه: «الإجابة وصلت السيرفر إمتى» سؤال عن طلب، مش عن
 * رسالة جوّه سوكت.
 */
@Controller('me/arena')
@UseGuards(ArenaOpenGuard)
@RequirePermission('quiz:read')
export class ArenaController {
  private readonly logger = new Logger(ArenaController.name);

  constructor(private readonly arena: ArenaService) {}

  /** اللوبي: الدفعة، الكورسات، رصيدك وترتيبك، والأوائل — ولو كنت في ماتش، هو. */
  @NoAnswerLeak()
  @Get()
  lobby(@CurrentUser() user: AuthenticatedUser): Promise<ArenaLobby> {
    return this.arena.lobby(user.id);
  }

  /**
   * الستريم — كل فريم فيه الشاشة كاملة من ناحيتك (`ArenaFrame`)، مش «الفرق».
   * أول فريم (`hello`) هو الحالة دلوقتي، فستريم رجع بعد قطع بيصلّح الشاشة لوحده.
   */
  @Throttle({ short: { limit: 3, ttl: seconds(1) }, medium: { limit: 30, ttl: seconds(60) } })
  @Get('stream')
  async stream(@CurrentUser() user: AuthenticatedUser, @Res() response: Response): Promise<void> {
    const open = openStreams.get(user.id) ?? 0;
    if (open >= MAX_STREAMS_PER_USER) {
      response.status(429).json({ message: 'too many open arena streams' });
      return;
    }
    openStreams.set(user.id, open + 1);

    // نفس هيدرز ستريم الإشعارات، ولنفس السبب: أي حاجة في النص (Cloudflare،
    // Traefik، Next) هتخزّن الرد لحد ما يخلص لو ماتقالهاش.
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'private, no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.flushHeaders();
    response.write('retry: 3000\n\n');

    let closed = false;
    const send = (frame: ArenaFrame): void => {
      if (closed) return;
      if (frame.type === 'view') assertNoLeak(frame.view);
      response.write(`data: ${JSON.stringify(frame)}\n\n`);
    };

    // الاشتراك قبل أول فريم: حدث بين الاتنين مايضيعش.
    const unsubscribe = this.arena.subscribe(user.id, send);
    const cleanup = (): void => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      clearTimeout(lifetime);
      untrack();
      unsubscribe();
      const left = (openStreams.get(user.id) ?? 1) - 1;
      if (left > 0) openStreams.set(user.id, left);
      else openStreams.delete(user.id);
      void this.arena.streamClosed(user.id).catch((error: Error) => this.logger.warn(error.message));
      response.end();
    };

    const heartbeat = setInterval(() => {
      send({ type: 'ping', at: Date.now() });
      void this.arena.streamAlive(user.id).catch(() => undefined);
    }, PING_MS);
    const lifetime = setTimeout(() => cleanup(), MAX_STREAM_MS);
    // الإغلاق (ديبلوي) بيقفله بإيده — وإلا السيرفر بيفضل مستنيه يخلص.
    const untrack = this.arena.trackStream(cleanup);
    // ⚠️ على الـresponse مش الـrequest — نفس الفخ اللي في ستريم الإشعارات.
    response.on('close', cleanup);

    try {
      const view = await this.arena.streamOpened(user.id);
      send({ type: 'view', at: Date.now(), fx: 'hello', view });
    } catch (error) {
      this.logger.warn(`arena stream open for ${user.id}: ${(error as Error).message}`);
      cleanup();
    }
  }

  /** «يلا نبدأ» — للطابور، أو للماتش اللي لسه شغّال. */
  @NoAnswerLeak()
  @Throttle({ short: { limit: 3, ttl: seconds(1) }, medium: { limit: 20, ttl: seconds(60) } })
  @UsePipes(ZodValidationPipe)
  @HttpCode(200)
  @Post('queue')
  join(@CurrentUser() user: AuthenticatedUser, @Body() body: ArenaQueueDto): Promise<ArenaView> {
    return this.arena.join(user.id, body.courseId);
  }

  /** «إلغاء» / «خروج» من الطابور. */
  @NoAnswerLeak()
  @HttpCode(200)
  @Delete('queue')
  cancel(@CurrentUser() user: AuthenticatedUser): Promise<ArenaView> {
    return this.arena.cancel(user.id);
  }

  /**
   * الإجابة. `receivedAt` بيتاخد أول ما الطلب يوصل هنا — ده الوقت اللي بيحكم
   * «مين جاوب الأول» و«الوقت خلص ولا لأ»، مش أي ساعة من المتصفح.
   */
  @NoAnswerLeak()
  @Throttle({ short: { limit: 5, ttl: seconds(1) }, medium: { limit: 120, ttl: seconds(60) } })
  @UsePipes(ZodValidationPipe)
  @HttpCode(200)
  @Post('matches/:matchId/answer')
  answer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() body: ArenaAnswerDto,
  ): Promise<ArenaAnswerResult> {
    const receivedAt = Date.now();
    return this.arena.answer(user.id, matchId, body.index, body.optionId, receivedAt);
  }

  /** «انسحاب» — الماتش للتاني. */
  @NoAnswerLeak()
  @HttpCode(200)
  @Post('matches/:matchId/leave')
  leave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('matchId', ParseUUIDPipe) matchId: string,
  ): Promise<ArenaView> {
    return this.arena.leave(user.id, matchId);
  }

  /** النبضة — كل ٤ ثواني وهو في الطابور أو في ماتش. مابتكتبش في Postgres. */
  @Throttle({ short: { limit: 3, ttl: seconds(1) }, medium: { limit: 40, ttl: seconds(60) } })
  @HttpCode(200)
  @Post('beat')
  beat(@CurrentUser() user: AuthenticatedUser): Promise<ArenaBeat> {
    return this.arena.beat(user.id);
  }
}

/** نفس شبكة `@NoAnswerLeak()`، على الفريمات اللي بتتكتب بإيدنا في الستريم. */
function assertNoLeak(view: ArenaView): void {
  const offending = [...collectKeysDeep(view)].filter((key) => FORBIDDEN_ANSWER_KEYS.has(key));
  if (offending.length > 0) throw new InternalServerErrorException();
}
