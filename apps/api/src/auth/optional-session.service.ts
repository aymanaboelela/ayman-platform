import { Inject, Injectable, Logger } from '@nestjs/common';
import { BETTER_AUTH, type BetterAuthLike } from './better-auth.token';
import type { AuthenticatedUser } from './decorators/current-user.decorator';

type IncomingHeaders = Record<string, string | string[] | undefined>;

/** The shape this service needs off an Express request. Structural, for the
 *  reason `auth.guard.ts` gives: no direct `express` dependency. */
export interface HeadersOnlyRequest {
  headers: IncomingHeaders;
}

function toWebHeaders(nodeHeaders: IncomingHeaders): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(key, entry);
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

/**
 * "Is anyone signed in?" — for routes that work either way.
 *
 * `AuthGuard` cannot answer this. On a `@Public()` route it returns before it
 * looks anything up, so `request.user` is never populated and `@CurrentUser()`
 * is always `undefined` there. That is correct for the catalog, which does not
 * care; المساعد does, because a signed-in student should not be asked to type
 * a name and a phone number the platform already has.
 *
 * ## Why this one fails OPEN, and why that is not a hole
 *
 * `AuthGuard` denies when the session lookup throws (S12, fail closed) because
 * the alternative there is letting an unauthenticated request into a protected
 * route. Here the fallback is `null` — treat the caller as a guest — and a
 * guest is the MORE restricted of the two: they must supply a name and a
 * WhatsApp number, they get a guest-scoped thread bound to a cookie, and they
 * can read nothing they did not open. A failed lookup degrades a student to a
 * stranger; it never promotes a stranger to a student.
 *
 * This is therefore not a second authorization path. Nothing gated by a
 * permission may be decided from its result — every such route keeps
 * `@RequirePermission()` and the real guard.
 */
@Injectable()
export class OptionalSessionService {
  private readonly logger = new Logger(OptionalSessionService.name);

  constructor(@Inject(BETTER_AUTH) private readonly auth: BetterAuthLike) {}

  async userOrNull(request: HeadersOnlyRequest): Promise<AuthenticatedUser | null> {
    try {
      const result = await this.auth.api.getSession({
        headers: toWebHeaders(request.headers),
      });
      return result?.user ?? null;
    } catch (error) {
      // Logged, not swallowed silently: a lookup that keeps failing is an
      // outage worth seeing, even though the request itself carries on.
      this.logger.warn('Optional session lookup failed; treating as guest', error as Error);
      return null;
    }
  }
}
