import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BETTER_AUTH, type BetterAuthLike } from '../better-auth.token';
import type { AuthenticatedSession } from '../decorators/current-session.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { userHasPermission } from '../permissions';
import { ALLOW_AGENT_TOKEN_KEY, NO_AGENT_TOKEN_KEY } from '../decorators/agent-token.decorator';
import { AgentTokenResolver, agentBearerFrom, type ResolvedAgentToken } from '../agent-token.resolver';
import { isFeatureEnabled } from '../../common/entitlements';
import { clientIpFromRequest } from '../../common/throttle/request-identity';

// Deliberately not `import type { Request } from 'express'`: this guard
// only ever touches `headers`, so a minimal structural type avoids adding a
// direct `express` dependency to a package that only has it transitively
// through `@nestjs/platform-express`.
type IncomingHeaders = Record<string, string | string[] | undefined>;

interface RequestWithUser {
  headers: IncomingHeaders;
  method?: string;
  url?: string;
  originalUrl?: string;
  ip?: string;
  user?: AuthenticatedUser;
  session?: AuthenticatedSession;
  /** Set only when the request was authenticated with an agent key. */
  agentToken?: ResolvedAgentToken;
}

/** Methods that change nothing — a key's reads are not audited, its writes are. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

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
    /*
     * `@Optional()` so a fixture that builds this guard without it still
     * compiles — and fails CLOSED: with no resolver an `ayk_` key is refused
     * below, never handed to the session path.
     */
    @Optional() private readonly agentTokens?: AgentTokenResolver,
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

    const agentKey = agentBearerFrom(request.headers);
    if (agentKey !== null) return this.authorizeAgentKey(context, request, agentKey);

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
    request.session = result.session;

    const requiredPermission = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    /* `userHasPermission` مش `roleHasPermission`: القفل على حساب بعينه هو
       الطريقة الوحيدة لعمل مساعد محدود — المساعدين كلهم رول `owner`، وأساسه
       «كل حاجة إلا المقالات». شوف `permissions.ts`. */
    if (requiredPermission && !userHasPermission(result.user.id, result.user.role, requiredPermission)) {
      throw new ForbiddenException();
    }

    return true;
  }

  /**
   * «ربط Claude» — a request carrying an `ayk_` key instead of a session.
   *
   * Same deny-by-default shape as the session path, three rules tighter:
   *
   * 1. The stack must have `agentTokens` on. Off, every key is a 401 before
   *    any lookup — the feature is "not here", not "here and closed".
   * 2. A route with no `@RequirePermission` is refused unless it says
   *    `@AllowAgentToken()` — those are the student's own routes.
   *    `@NoAgentToken()` refuses outright (key management).
   * 3. The permission must be on the key AND still held by its creator
   *    (`ResolvedAgentToken.permissions` is already that intersection), and
   *    `userHasPermission` is asked as well, so a per-user deny still wins.
   *
   * Writes and refusals are audited; reads are not (see `recordUse`).
   */
  private async authorizeAgentKey(
    context: ExecutionContext,
    request: RequestWithUser,
    raw: string,
  ): Promise<boolean> {
    if (!this.agentTokens || !isFeatureEnabled('agentTokens')) throw new UnauthorizedException();

    const ip = clientIpFromRequest(request);
    let token: ResolvedAgentToken | null;
    try {
      token = await this.agentTokens.resolve(raw, ip);
    } catch (error) {
      this.logger.error('Agent key lookup failed; denying request (fail closed)', error as Error);
      throw new UnauthorizedException();
    }
    if (!token) throw new UnauthorizedException();

    request.user = token.user;
    request.session = { id: `agent-token:${token.id}` };
    request.agentToken = token;

    const method = (request.method ?? 'GET').toUpperCase();
    const userAgentHeader = request.headers['user-agent'];
    const trail = {
      method,
      path: (request.originalUrl ?? request.url ?? '').split('?')[0] ?? '',
      ip,
      userAgent: Array.isArray(userAgentHeader) ? (userAgentHeader[0] ?? null) : (userAgentHeader ?? null),
    };
    const targets = [context.getHandler(), context.getClass()];

    const deny = (permission: string | null): never => {
      this.agentTokens?.recordUse(token, trail, 'denied', permission);
      throw new ForbiddenException('This key does not carry the permission for this route');
    };

    if (this.reflector.getAllAndOverride<boolean>(NO_AGENT_TOKEN_KEY, targets)) deny(null);

    const requiredPermission = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, targets);
    if (!requiredPermission) {
      if (!this.reflector.getAllAndOverride<boolean>(ALLOW_AGENT_TOKEN_KEY, targets)) deny(null);
    } else if (
      !token.permissions.has(requiredPermission) ||
      !userHasPermission(token.user.id, token.user.role, requiredPermission)
    ) {
      deny(requiredPermission);
    }

    if (!READ_METHODS.has(method)) {
      this.agentTokens.recordUse(token, trail, 'success', requiredPermission ?? null);
    }
    return true;
  }
}
