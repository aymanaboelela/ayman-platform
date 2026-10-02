import { Body, Controller, Get, HttpCode, Param, Post, Query, Res, UsePipes } from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import {
  LIVE_QUEUES,
  type LiveQueue,
  type NotificationEvent,
  type NotificationFeed,
  type UnreadCount,
} from '@ayman/contracts/notifications';
import type { PushPublicKey } from '@ayman/contracts/notifications/push';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { userHasPermission, type Permission } from '../../auth/permissions';
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

/**
 * Who may hear each admin queue on their stream — the SAME permission that
 * guards the list the frame tells them to re-read. A frame carries only a
 * count, but a count of pending payments is still the desk's business, and
 * answering «who may know» twice, in two different places, is how the two
 * answers drift apart.
 */
const QUEUE_PERMISSION: Record<LiveQueue, Permission> = {
  payments: 'payment:read',
  // «طلبات الشحن» — the same authority that opens the top-up review screen.
  'wallet-topups': 'payment:read',
};

/**
 * Each open stream is a socket, a heartbeat timer and a subscriber held for as
 * long as the client likes — and nothing capped either the number or the
 * length, so one account could open streams until the process ran out of
 * sockets. Eight covers every tab and device a real person has open at once;
 * past that the oldest keep working and the new one gets a 429. Thirty minutes
 * is a ceiling on one connection, not on the feature: the browser's
 * `EventSource` reconnects on its own after `retry:` and the student never
 * notices.
 */
const MAX_STREAMS_PER_USER = 8;
const MAX_STREAM_MS = 30 * 60_000;
const openStreams = new Map<string, number>();

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * `/api/me/notifications` — the caller's own, whoever they are.
 *
 * Same prefix and the same identity discipline as `/api/me/dashboard`,
 * `/api/me/quizzes` and `/api/me/activity`: the read routes take no id
 * parameter at all, and the one route that does (`:id/read`) is scoped by
 * `{ id, userId }` inside `updateMany`, so a guessed id belonging to another
 * account updates zero rows instead of theirs.
 *
 * ⚠️ No `@RequirePermission` on any route here, on purpose — every route
 * used to carry `profile:read`/`profile:write`, reasoning «every signed-in
 * student holds it». That was true until the per-account permission screen
 * (`/admin/roles` → «المساعد ده يشوف إيه») existed: an assistant scoped down
 * to a handful of sections (رد على المحادثات، مراجعة الدفعات — never «الملف
 * الشخصي», which has nothing to do with either) lost `profile:read`, and
 * `<NotificationBell>` — mounted for every admin page, not opt-in — threw a
 * plain `Error` on the 403 straight through `ErrorBoundaryHandler`:
 * «الصفحة وقعت» on `/admin` itself, for an account whose actual granted
 * permissions worked everywhere they were checked.
 *
 * The bell is not a course-content or profile-content screen; it is the
 * self-scoped inbox every signed-in account — student, assistant, admin —
 * is owed regardless of what else it may or may not do. `AuthGuard`'s bare
 * deny-by-default is the correct gate, same reasoning as `SessionController`
 * (see its own note): authenticated is the only question this answers, not
 * «entitled to what».
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
   * `AuthGuard` as every other route in this file, so «مين ده» is answered
   * once, in the place it is already answered. A WebSocket would
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
  @Get('notifications/stream')
  stream(@CurrentUser() user: AuthenticatedUser, @Res() response: Response): void {
    const open = openStreams.get(user.id) ?? 0;
    if (open >= MAX_STREAMS_PER_USER) {
      response.status(429).json({ message: 'too many open notification streams' });
      return;
    }
    openStreams.set(user.id, open + 1);

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

    /*
      The admin queues this account may hear — «a payment request just
      arrived» reaching `/admin/payments` without a refresh.

      On THIS connection rather than a second stream per screen: every admin
      tab already holds this one open for the bell, and a second long-lived
      request per tab would double what Traefik and Cloudflare hold open for
      nothing. The heartbeat, the headers against buffering and the client's
      reconnect below all already work, in production, on this route.

      Asked twice. Once here, so a student's stream never even subscribes; and
      again per frame, because a stream stays open for hours and an assistant
      whose `payment:read` is locked mid-shift (`permission-grants`) must stop
      hearing the desk at the next frame, not at their next reload.
    */
    const queueUnsubscribes = LIVE_QUEUES.filter((queue) =>
      userHasPermission(user.id, user.role, QUEUE_PERMISSION[queue]),
    ).map((queue) =>
      this.realtime.subscribeQueue(queue, (event) => {
        if (userHasPermission(user.id, user.role, QUEUE_PERMISSION[queue])) send(event);
      }),
    );

    const heartbeat = setInterval(() => {
      send({ type: 'ping' });
    }, HEARTBEAT_MS);

    // Ending the response fires `close` below, which does all the cleanup.
    const lifetime = setTimeout(() => response.end(), MAX_STREAM_MS);

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
      clearTimeout(lifetime);
      unsubscribe();
      for (const off of queueUnsubscribes) off();
      const left = (openStreams.get(user.id) ?? 1) - 1;
      if (left > 0) openStreams.set(user.id, left);
      else openStreams.delete(user.id);
      response.end();
    });
  }

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
  @Post('notifications/:id/read')
  @HttpCode(204)
  async read(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.notifications.markRead(user.id, id);
  }

  @Post('notifications/read-all')
  @HttpCode(204)
  async readAll(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.notifications.markAllRead(user.id);
  }

  /*
   * ── Web Push — the leg that reaches a browser with no tab open ──────────
   *
   * Three routes, no `@RequirePermission` like every route above: this is a
   * self-service toggle on the CALLER'S OWN browser, not a kind-specific
   * authority, so it needs no permission of its own — same reasoning as the
   * feed and the mark-read routes, see the class-level note.
   */

  /** `null` when `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` are
   *  not all configured — the toggle stays quiet in that case rather than
   *  subscribing a browser the API could never send to. */
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
  @Post('push/subscribe')
  @HttpCode(204)
  @UsePipes(ZodValidationPipe)
  async subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: PushSubscribeDto,
  ): Promise<void> {
    await this.push.subscribe(user.id, body);
  }

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
