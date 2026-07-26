import { Body, Controller, Param, Post, UsePipes } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import type { HeartbeatResponse } from '@ayman/contracts';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { HeartbeatDto } from './heartbeat.dto';
import { HeartbeatService } from './heartbeat.service';

@Controller('lessons')
export class ProgressController {
  constructor(private readonly heartbeat: HeartbeatService) {}

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
}
