import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UsePipes,
} from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import type { Request, Response } from 'express';
import type {
  ConversationThread,
  MyConversation,
} from '@ayman/contracts/assistant/conversation';
import type { MyConversationSummary } from '@ayman/contracts/assistant/summary';
import { Public } from '../../auth/decorators/public.decorator';
import { OptionalSessionService } from '../../auth/optional-session.service';
import { RequireCsrf } from '../security/require-csrf.decorator';
import { loadEnv } from '../../config/env';
import { NotificationsService } from '../notifications/notifications.service';
import { AssistantService, summaryPreview } from './assistant.service';
import { ConversationAttachmentService } from './conversation-attachment.service';
import { sendAttachment } from './serve-attachment';
import { OpenConversationDto, PostMessageDto } from './assistant.dto';
import {
  GUEST_COOKIE_MAX_AGE_SECONDS,
  guestCookieName,
  readCookie,
} from './guest-token';

/**
 * `/api/assistant/*` — the visitor's side of المساعد.
 *
 * ## `@Public()` AND `@RequireCsrf()`
 *
 * These routes have to work for someone who has never signed in, so the auth
 * guard cannot gate them. That does NOT make a forged cross-site POST
 * acceptable: without the CSRF check, another origin could make a signed-in
 * student's browser open a conversation, or append to the thread they already
 * have, and the instructor would read words that student never typed. The two
 * questions — "does this need a session?" and "does this need an origin
 * check?" — are answered separately here for the first time in this codebase.
 *
 * ## Two limits, not one
 *
 * `@Throttle` caps requests per unit time; `MAX_OPEN_PER_IDENTITY` in the
 * service caps state. A script that posts once an hour forever passes every
 * rate limit and still fills the inbox, so the rate limit alone is not enough.
 */

/** Opening a thread is expensive — it creates rows and demands attention. */
const OPEN_THROTTLE = {
  short: { limit: 1, ttl: seconds(10) },
  medium: { limit: 3, ttl: seconds(600) },
  long: { limit: 5, ttl: seconds(3600) },
};

/** Following up in a thread that already exists is cheaper. */
const MESSAGE_THROTTLE = {
  short: { limit: 1, ttl: seconds(3) },
  medium: { limit: 10, ttl: seconds(600) },
};

@Controller('assistant')
export class AssistantController {
  private readonly cookieName: string;
  private readonly isProduction: boolean;

  constructor(
    private readonly assistant: AssistantService,
    private readonly attachments: ConversationAttachmentService,
    private readonly session: OptionalSessionService,
    private readonly notifications: NotificationsService,
  ) {
    this.isProduction = loadEnv(process.env).NODE_ENV === 'production';
    this.cookieName = guestCookieName(this.isProduction);
  }

  /**
   * Tells every admin holding `conversation:read` that a student is waiting
   * on a reply — a new thread or a follow-up, `open` and `post` are the only
   * two callers. Fire-and-forget, deliberately not awaited by the route
   * handler beyond `.catch()`: see `NotificationsService.notifyPermission`
   * for why this cannot ride inside `AssistantService`'s own transaction, and
   * `PushService`'s header for why a failed send here never surfaces to the
   * student who just asked a question that WAS saved correctly.
   */
  private notifyAdmins(conversationId: string, message: string): void {
    void this.notifications
      .notifyPermission('conversation:read', 'assistant_question_received', {
        conversationId,
        preview: summaryPreview(message),
      })
      .catch(() => undefined);
  }

  /**
   * The thread the caller owns, or `{ conversation: null }`.
   *
   * Read by the PANEL, when it opens — not on every page load any more. It
   * returns 200 in the ordinary "no thread" case rather than a 404, so that
   * "you have never written to us" stays distinguishable from "that id does
   * not exist"; see the service.
   */
  @Public()
  @Get('conversations/mine')
  async mine(@Req() request: Request): Promise<MyConversation> {
    const user = await this.session.userOrNull(request);
    const guestToken = readCookie(request.headers.cookie, this.cookieName) ?? null;
    return {
      conversation: await this.assistant.myThread(user?.id ?? null, guestToken),
      isSignedIn: user !== null,
    };
  }

  /**
   * The same question, answered in four primitives — and THIS is the one the
   * widget asks on every page load.
   *
   * ## Why a second route rather than a query parameter on the first
   *
   * A `?summary=1` on `mine` would give one route two response shapes, which
   * is a thing every client then has to narrow at runtime and every reader has
   * to hold in their head. Two routes, two contracts, one service call each.
   *
   * The launcher needs to know whether to draw the unread dot before anyone
   * opens anything, so this cannot move into the panel — the dot exists
   * precisely to tell a student there is something worth opening. What it
   * does NOT need is the conversation: `assistant-widget.tsx` was pulling
   * every message ever exchanged onto the landing page opened from a WhatsApp
   * link, and validating it with a 62 KB schema, to render a circle. This
   * shape carries no messages at all, and its contract carries no Zod, so the
   * web side can import it statically and the probe costs a request and
   * nothing else.
   *
   * Same guard (`@Public()`, because a guest with a cookie has a thread too),
   * same cookie, same ownership check inside the same service. The only thing
   * that differs from `mine` is how much comes back.
   */
  @Public()
  @Get('conversations/mine/summary')
  async mineSummary(@Req() request: Request): Promise<MyConversationSummary> {
    const user = await this.session.userOrNull(request);
    const guestToken = readCookie(request.headers.cookie, this.cookieName) ?? null;
    return {
      ...(await this.assistant.myThreadSummary(user?.id ?? null, guestToken)),
      isSignedIn: user !== null,
    };
  }

  @Public()
  @RequireCsrf()
  @Throttle(OPEN_THROTTLE)
  @UsePipes(ZodValidationPipe)
  @Post('conversations')
  async open(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: OpenConversationDto,
  ): Promise<ConversationThread> {
    const user = await this.session.userOrNull(request);

    const result = await this.assistant.open({
      entryPath: body.entryPath,
      message: body.message,
      userId: user?.id ?? null,
      // Identity comes from the SESSION. A signed-in caller who posts a name
      // and a phone does not get to use them — the service ignores this field
      // entirely when `userId` is set.
      guest:
        user || !body.name || !body.phone ? null : { name: body.name, phone: body.phone },
    });

    if (result.guestToken) {
      /*
       * `httpOnly` so no script can read it, `SameSite=Strict` because this
       * cookie is never needed on a cross-site navigation, `Secure` + the
       * `__Host-` prefix in production so it cannot be set by a subdomain or
       * over http. The prefix is production-only for the reason
       * `auth.config.ts` records at length: Safari will not accept a `Secure`
       * cookie on `http://localhost`, and a cookie that silently fails to be
       * set in one dev browser is worse than an unprefixed one.
       *
       * No `domain`, and `path: '/'` — both are hard requirements of
       * `__Host-`, and setting a domain would break the prefix silently.
       */
      response.cookie(this.cookieName, result.guestToken, {
        httpOnly: true,
        secure: this.isProduction,
        sameSite: 'strict',
        path: '/',
        maxAge: GUEST_COOKIE_MAX_AGE_SECONDS * 1000,
      });
    }

    this.notifyAdmins(result.thread.id, body.message);

    return result.thread;
  }

  @Public()
  @RequireCsrf()
  @Throttle(MESSAGE_THROTTLE)
  @UsePipes(ZodValidationPipe)
  @Post('conversations/:id/messages')
  async post(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PostMessageDto,
  ): Promise<ConversationThread> {
    const user = await this.session.userOrNull(request);
    const guestToken = readCookie(request.headers.cookie, this.cookieName) ?? null;
    const thread = await this.assistant.postMessage(id, user?.id ?? null, guestToken, body.message);
    this.notifyAdmins(id, body.message);
    return thread;
  }

  /**
   * 204: the caller already knows what it marked, and an empty 200 invites a
   * client to depend on a shape that does not exist. Same reasoning as
   * `NotificationsController`'s read routes.
   */
  /**
   * A file the instructor attached, streamed to the student it was sent to.
   *
   * ## `@Public()` and still not readable by the public
   *
   * Same reasoning as every route above: a GUEST has a thread too, and their
   * only identity is the `__Host-assistant` cookie, so the auth guard cannot
   * be the gate. The gate is `ownerWhere` — `{ userId }` for a signed-in
   * student, `{ guestTokenHash }` for a guest — applied inside the query as a
   * filter on the message's own conversation. A caller with neither is refused
   * before the database is touched, and a caller with one gets zero rows for
   * any thread that is not theirs.
   *
   * No `@RequireCsrf()`: it is a GET, it changes nothing, and the CSRF header
   * convention exists for writes. `Cache-Control: private, no-store` on the
   * response is what keeps the bytes off a shared machine afterwards.
   */
  @Public()
  @Get('conversations/:id/messages/:messageId/attachment')
  async attachment(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Query('download') download: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const user = await this.session.userOrNull(request);
    const guestToken = readCookie(request.headers.cookie, this.cookieName) ?? null;
    const owner = this.attachments.ownerWhere(user?.id ?? null, guestToken);
    // Nobody at all — no session, no cookie. 403 rather than 404: there is
    // nothing to disclose either way, and «you are not signed in» is the true
    // answer.
    if (!owner) throw new ForbiddenException();

    sendAttachment(await this.attachments.stream(id, messageId, owner), download, response);
  }

  @Public()
  @RequireCsrf()
  @Post('conversations/:id/read')
  @HttpCode(204)
  async read(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const user = await this.session.userOrNull(request);
    const guestToken = readCookie(request.headers.cookie, this.cookieName) ?? null;
    await this.assistant.markVisitorRead(id, user?.id ?? null, guestToken);
  }
}
