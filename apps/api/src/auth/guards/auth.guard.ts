import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BETTER_AUTH, type BetterAuthLike } from '../better-auth.token';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { roleHasPermission } from '../permissions';

// Deliberately not `import type { Request } from 'express'`: this guard
// only ever touches `headers`, so a minimal structural type avoids adding a
// direct `express` dependency to a package that only has it transitively
// through `@nestjs/platform-express`.
type IncomingHeaders = Record<string, string | string[] | undefined>;

interface RequestWithUser {
  headers: IncomingHeaders;
  user?: AuthenticatedUser;
}

/**
 * Builds a WHATWG `Headers` object from Express/Node request headers — the
 * shape Better Auth's `api.getSession` expects. Hand-rolled instead of
 * importing `fromNodeHeaders` from `better-auth/node`: that package ships
 * ESM-only with no CJS entry, and this guard is loaded by every test that
 * exercises it — pulling in an ESM-only package here would drag Jest's
 * CJS-based loader into a fight it doesn't need for what is a five-line
 * header conversion. `BetterAuthLike` (see `../better-auth.token`) already
 * keeps the real `better-auth`/`@thallesp/nestjs-better-auth` imports
 * confined to `auth.module.ts`, which no spec ever loads.
 */
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
 * Deny-by-default authorization guard, registered as `APP_GUARD` so it runs
 * on every route in the application. A route is reachable without a session
 * only when decorated `@Public()`; a route additionally decorated
 * `@RequirePermission(...)` also requires the session's role to hold that
 * `resource:action` permission (never a role equality check — see
 * `../permissions`).
 *
 * S12 (fail closed): if the session lookup itself throws — adapter error, DB
 * down, whatever — this guard denies with 401. It never treats a lookup
 * failure as "no session, but let the request through anyway."
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(BETTER_AUTH) private readonly auth: BetterAuthLike,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();

    let result: Awaited<ReturnType<BetterAuthLike['api']['getSession']>>;
    try {
      result = await this.auth.api.getSession({ headers: toWebHeaders(request.headers) });
    } catch (error) {
      this.logger.error('Session lookup failed; denying request (fail closed)', error as Error);
      throw new UnauthorizedException();
    }

    if (!result) {
      throw new UnauthorizedException();
    }

    request.user = result.user;

    const requiredPermission = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredPermission && !roleHasPermission(result.user.role, requiredPermission)) {
      throw new ForbiddenException();
    }

    return true;
  }
}
