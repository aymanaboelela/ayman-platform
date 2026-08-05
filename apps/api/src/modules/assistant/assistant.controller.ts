import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
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
import { Public } from '../../auth/decorators/public.decorator';
import { OptionalSessionService } from '../../auth/optional-session.service';
import { RequireCsrf } from '../security/require-csrf.decorator';
import { loadEnv } from '../../config/env';
import { AssistantService } from './assistant.service';
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
    private readonly session: OptionalSessionService,
  ) {
    this.isProduction = loadEnv(process.env).NODE_ENV === 'production';
    this.cookieName = guestCookieName(this.isProduction);
  }

  /**
   * The thread the caller owns, or `{ conversation: null }`.
   *
   * Called on every page load by the widget, so it is a cheap indexed lookup
   * and returns 200 in the ordinary "no thread" case — see the service.
   */
  @Public()
  @Get('conversations/mine')
  async mine(@Req() request: Request): Promise<MyConversation> {
    const user = await this.session.userOrNull(request);
    const guestToken = readCookie(request.headers.cookie, this.cookieName) ?? null;
    return {
      conversation: await this.assistant.myThread(user?.id ?? null, guestToken),
      /**
       * Rides along on the lookup the widget already makes, so the escalation
       * form knows whether to ask a guest for their name and number without a
       * second round trip on every page load. `user` is resolved here anyway.
       */
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
    return this.assistant.postMessage(id, user?.id ?? null, guestToken, body.message);
  }

  /**
   * 204: the caller already knows what it marked, and an empty 200 invites a
   * client to depend on a shape that does not exist. Same reasoning as
   * `NotificationsController`'s read routes.
   */
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
