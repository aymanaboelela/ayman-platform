import { Body, Controller, Get, HttpCode, Param, Post, Query, Res, UsePipes } from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import type {
  NotificationEvent,
  NotificationFeed,
  UnreadCount,
} from '@ayman/contracts/notifications';
import type { PushPublicKey } from '@ayman/contracts/notifications/push';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { NotificationsService } from './notifications.service';
import { NotificationsRealtimeService } from './notifications-realtime.service';
import { PushService } from './push.service';
import { PushSubscribeDto, PushUnsubscribeDto } from './push.dto';

/**
 * How often the stream writes a comment frame to prove it is alive.
 *
 * 25 seconds, under every proxy idle timeout this deployment sits behind
 * (Traefik's default read timeout, Cloudflare's 100s, and the ~60s a mobile
 * radio will hold an idle socket). A stream that dies silently is worse than
 * one that never opened, because the client believes it is live and stops
 * asking.
 */
const HEARTBEAT_MS = 25_000;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * `/api/me/notifications` — the student's own.
 *
 * Same prefix and the same identity discipline as `/api/me/dashboard`,
 * `/api/me/quizzes` and `/api/me/activity`: the read routes take no id
 * parameter at all, and the one route that does (`:id/read`) is scoped by
 * `{ id, userId }` inside `updateMany`, so a guessed id belonging to another
 * student updates zero rows instead of theirs.
 *
 * `profile:read` is the permission — every signed-in student holds it, and
 * notifications are personal rather than course content. Deliberately not
 * `quiz:read`, even though two of the three kinds come from the quiz engine:
 * the notification list is about the caller, not about a quiz.
 */
@Controller('me')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly realtime: NotificationsRealtimeService,
    private readonly push: PushService,
  ) {}

  /**
   * The live feed — Server-Sent Events, one connection per open tab.
   *
   * ## Why SSE rather than a WebSocket
   *
   * The traffic is one-directional: the server says something happened and the
   * client never answers on the same channel. SSE is the protocol shaped like
   * that, and — more usefully here — it is plain HTTP. It goes through the same
   * Traefik, carries the same session cookie, and passes the same
   * `RequirePermission` guard as every other route in this file, so «مين ده»
   * is answered once, in the place it is already answered. A WebSocket would
   * need its own upgrade path through the proxy, its own authentication
   * handshake, and its own reconnect logic, to carry strictly less.
   *
   * The browser also reconnects on its own after a drop, with backoff, for
   * free. Nothing in the client has to implement that.
   *
   * ## What it does NOT do
   *
   * It never decides anything. Every frame is a copy of what
   * `GET /api/me/notifications` would return anyway — the stream is a way to
   * learn about a change sooner, and a client that misses every frame is
   * behind by one poll, not wrong.
   */
  @RequirePermission('profile:read')
  @Get('notifications/stream')
  stream(@CurrentUser() user: AuthenticatedUser, @Res() response: Response): void {
    /*
      `no-transform` and `X-Accel-Buffering: no` for the reason the assistant's
      own stream carries them: something between here and the browser will
      otherwise buffer the response until it is complete, which turns a live
      stream into a request that never answers.
    */
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'private, no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.flushHeaders();

    // `retry:` is the browser's reconnect delay. Stated once, up front, so a
    // dropped connection comes back in five seconds rather than on whatever
    // the default happens to be.
    response.write('retry: 5000\n\n');

    const send = (event: NotificationEvent): void => {
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const unsubscribe = this.realtime.subscribe(user.id, send);

    const heartbeat = setInterval(() => {
      send({ type: 'ping' });
    }, HEARTBEAT_MS);

    /*
      ⚠️ ON THE RESPONSE, NOT ON THE REQUEST — the same trap documented at
      length in `assistant-ask.controller.ts`. Node emits `close` on the
      REQUEST as soon as its body has been read, which for a GET is
      immediately: listening there would tear the stream down microseconds
      after opening it, and the symptom would be a feature that silently never
      works rather than an error anywhere.
    */
    response.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      response.end();
    });
  }

  @RequirePermission('profile:read')
  @Get('notifications')
  feed(
    @CurrentUser() user: AuthenticatedUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<NotificationFeed> {
    return this.notifications.feed(user.id, clampLimit(limit), cursor);
  }

  /**
   * Its own route rather than a field on the feed: the topbar renders this on
   * every page and must not fetch twenty rows to show one number.
   */
  @RequirePermission('profile:read')
  @Get('notifications/unread-count')
  async unread(@CurrentUser() user: AuthenticatedUser): Promise<UnreadCount> {
    return { unread: await this.notifications.unreadCount(user.id) };
  }

  /**
   * 204, not 200 with a body. There is nothing useful to return — the caller
   * already knows which notification it marked — and an empty 200 invites a
   * client to start depending on a shape that does not exist.
   *
   * Idempotent: marking an already-read notification does not move its
   * timestamp, so "when did I read this" stays true across a double-click or a
   * retried request.
   */
  @RequirePermission('profile:write')
  @Post('notifications/:id/read')
  @HttpCode(204)
  async read(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.notifications.markRead(user.id, id);
  }

  @RequirePermission('profile:write')
  @Post('notifications/read-all')
  @HttpCode(204)
  async readAll(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.notifications.markAllRead(user.id);
  }

  /*
   * ── Web Push — the leg that reaches a browser with no tab open ──────────
   *
   * Three routes, `profile:read`/`profile:write` like every route above:
   * this is a self-service toggle on the CALLER'S OWN browser, not a kind-
   * specific authority, so it needs no permission of its own — the same
   * reasoning that keeps the feed and the mark-read routes on `profile:*`
   * rather than inventing one per notification kind.
   */

  /** `null` when `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` are
   *  not all configured — the toggle stays quiet in that case rather than
   *  subscribing a browser the API could never send to. */
  @RequirePermission('profile:read')
  @Get('push/public-key')
  publicKey(): PushPublicKey {
    return { publicKey: this.push.publicKey() };
  }

  /**
   * Upserts on `endpoint` — see `PushService.subscribe`. 204 for the same
   * reason `read`/`readAll` above are: the caller already holds the
   * subscription object it just posted, and there is nothing useful to hand
   * back.
   */
  @RequirePermission('profile:write')
  @Post('push/subscribe')
  @HttpCode(204)
  @UsePipes(ZodValidationPipe)
  async subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: PushSubscribeDto,
  ): Promise<void> {
    await this.push.subscribe(user.id, body);
  }

  @RequirePermission('profile:write')
  @Post('push/unsubscribe')
  @HttpCode(204)
  @UsePipes(ZodValidationPipe)
  async unsubscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: PushUnsubscribeDto,
  ): Promise<void> {
    await this.push.unsubscribe(user.id, body.endpoint);
  }
}

/**
 * `Number.parseInt` on junk is `NaN`, and `Math.min(NaN, …)` is `NaN`, which
 * Prisma's `take` rejects at the driver as a 500. Every non-numeric input
 * lands on the default instead.
 */
function clampLimit(raw?: string): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}
