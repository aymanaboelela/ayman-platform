import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { loadEnv } from '../../config/env';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';

/** GET/HEAD/OPTIONS never mutate state — CSRF has nothing to protect there. */
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * A same-origin fetch always sends `same-origin`; a top-level same-origin
 * navigation (e.g. a Server Action) sends `none`. Deliberately does NOT
 * reject an ABSENT header — Plan 3/4's `apiSend`/Next Server Actions call
 * this API server-to-server (a plain Node `fetch`, not a browser request),
 * which carries neither `Sec-Fetch-Site` nor `Origin` at all. Rejecting
 * "absent" would also reject every legacy/older browser that never
 * implemented Fetch Metadata — the header requirement below is what
 * actually stops a forged cross-site request; this is defence in depth on
 * top of it, not the sole gate.
 */
const ALLOWED_SEC_FETCH_SITE = new Set(['same-origin', 'none']);

type IncomingHeaders = Record<string, string | string[] | undefined>;

interface RequestLike {
  method: string;
  headers: IncomingHeaders;
}

function headerValue(headers: IncomingHeaders, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * S9. Three layers, per the plan and spec §7 P5 (`SameSite=Strict` is
 * defence-in-depth only, per OWASP's own guidance that the naive
 * double-submit pattern alone is bypassable):
 *
 *  1. A required custom header (`x-csrf-token`) on every state-changing
 *     method. This is the load-bearing control: a plain cross-site HTML
 *     form cannot add a custom header, and a cross-origin `fetch` that
 *     tries one triggers a CORS preflight this API never answers (no CORS
 *     is configured anywhere — Global Constraint #1). The header's VALUE is
 *     NOT re-verified against the `__Host-csrf` cookie `proxy.ts` mints
 *     (true double-submit equality) — presence is the control, matching
 *     every later plan's client code, which sends the cookie's value as a
 *     courtesy so that check could be tightened later without touching any
 *     caller.
 *  2. Server-side `Origin` validation: if present, must equal `APP_URL`
 *     exactly — the one origin the browser ever talks to (single-origin
 *     design, Global Constraint #1).
 *  3. Server-side `Sec-Fetch-Site` validation — see the constant above for
 *     why "absent" is accepted rather than rejected.
 *
 * Skips `@Public()` routes (same metadata `AuthGuard` reads): a route with
 * no session to protect has nothing for CSRF to defend, and a browser's
 * built-in CSP-violation report POST (Plan 7) cannot carry a custom header
 * at all.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly appUrl: string;

  constructor(private readonly reflector: Reflector) {
    this.appUrl = loadEnv(process.env).APP_URL;
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestLike>();
    if (!STATE_CHANGING_METHODS.has(request.method.toUpperCase())) return true;

    const origin = headerValue(request.headers, 'origin');
    if (origin !== undefined && origin !== this.appUrl) {
      throw new ForbiddenException('CSRF: origin mismatch');
    }

    const secFetchSite = headerValue(request.headers, 'sec-fetch-site');
    if (secFetchSite !== undefined && !ALLOWED_SEC_FETCH_SITE.has(secFetchSite)) {
      throw new ForbiddenException('CSRF: cross-site request');
    }

    const token = headerValue(request.headers, 'x-csrf-token');
    if (!token) {
      throw new ForbiddenException('CSRF: missing x-csrf-token header');
    }

    return true;
  }
}
