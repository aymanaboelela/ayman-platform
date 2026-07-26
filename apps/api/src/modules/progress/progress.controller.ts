import { Body, Controller, Param, Post, UsePipes } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import type { HeartbeatResponse, LessonProgressDto } from '@ayman/contracts';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { EmptyBodyDto, HeartbeatDto } from './heartbeat.dto';
import { HeartbeatService } from './heartbeat.service';
import { LessonProgressService } from './lesson-progress.service';

@Controller('lessons')
export class ProgressController {
  constructor(
    private readonly heartbeat: HeartbeatService,
    private readonly lessonProgress: LessonProgressService,
  ) {}

  /**
   * One heartbeat per 10s of playback, so an honest client sends 6/minute.
   *
   * The limits below are per SESSION, not per IP (see
   * `common/throttle/request-identity`) — an IP bucket would put a whole
   * school lab into one counter and lock forty students out of their own
   * lessons. 15/minute leaves room for a remount plus a couple of retries;
   * 500/hour covers continuous watching (360/hour) with headroom.
   *
   * These limits are a resource control, not the anti-cheat: even at the
   * ceiling, 15 requests × the 2s grace = 30s of credit per minute, which is
   * strictly worse than just watching the video.
   */
  @RequirePermission('progress:write')
  @Throttle({
    short: { limit: 2, ttl: seconds(1) },
    medium: { limit: 15, ttl: seconds(60) },
    long: { limit: 500, ttl: seconds(3600) },
  })
  @Post(':lessonId/heartbeat')
  @UsePipes(ZodValidationPipe)
  record(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId') lessonId: string,
    @Body() body: HeartbeatDto,
  ): Promise<HeartbeatResponse> {
    // `user.id` comes from the session; the body carries no identity at all.
    return this.heartbeat.record(user.id, lessonId, body);
  }

  /** Called once when the player mounts. Cheap, and the basis of resume. */
  @RequirePermission('progress:write')
  @Post(':lessonId/open')
  @UsePipes(ZodValidationPipe)
  open(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId') lessonId: string,
    @Body() _body: EmptyBodyDto,
  ): Promise<LessonProgressDto> {
    return this.lessonProgress.open(user.id, lessonId);
  }

  /**
   * The 5000ms dwell. The body is EMPTY and strict — the elapsed time is
   * measured server-side, so there is deliberately nothing here for a client
   * to report or forge.
   */
  @RequirePermission('progress:write')
  @Throttle({ short: { limit: 2, ttl: seconds(1) }, medium: { limit: 20, ttl: seconds(60) } })
  @Post(':lessonId/dwell')
  @UsePipes(ZodValidationPipe)
  dwell(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId') lessonId: string,
    @Body() _body: EmptyBodyDto,
  ): Promise<HeartbeatResponse> {
    return this.lessonProgress.completeByDwell(user.id, lessonId);
  }

  /**
   * "أنهيت الدرس · التالي". `EmptyBodyDto` is `.strict()`, so the realistic
   * mass-assignment attempt — `{completed: true}`, `{score: 100}` — is a 400
   * here rather than a field that silently lands somewhere.
   */
  @RequirePermission('progress:write')
  @Post(':lessonId/complete')
  @UsePipes(ZodValidationPipe)
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId') lessonId: string,
    @Body() _body: EmptyBodyDto,
  ): Promise<HeartbeatResponse> {
    return this.lessonProgress.completeManually(user.id, lessonId);
  }
}
