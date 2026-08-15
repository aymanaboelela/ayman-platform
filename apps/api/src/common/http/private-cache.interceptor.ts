import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';

interface ResponseLike {
  setHeader(name: string, value: string): void;
  getHeader(name: string): unknown;
}

/**
 * Stamps `Cache-Control: private, no-store` on every response that is not
 * explicitly `@Public()`.
 *
 * ## The hole this closes
 *
 * The API sent NO `Cache-Control` header at all — measured on production
 * 2026-08-15, `/api/me/dashboard` answered `200` with none. RFC 9111 lets a
 * shared cache apply HEURISTIC freshness to a cacheable status with no
 * explicit directive, so "no header" is not the same as "do not cache"; it
 * means "decide for yourself".
 *
 * That was survivable only because nothing in front of the origin happened to
 * be caching those paths (`cf-cache-status: DYNAMIC`). It stopped being
 * survivable at the CSV exports. `/api/admin/analytics/export/students.csv`
 * carries every student's full name, governorate, scores and last-active time,
 * and its path ends in `.csv` — an extension in Cloudflare's DEFAULT
 * cache-by-extension list. One Cache Rule, or one default that changes under
 * us, and an admin's export of the entire student body is sitting in a shared
 * edge cache keyed on a URL with no session in it.
 *
 * ## Why an interceptor rather than `@Header()` on the three CSV routes
 *
 * Because the CSV routes are where it was going to bite FIRST, not where the
 * problem is. Every authenticated route — the dashboard, the profile, the
 * notification list, every admin read — has the same missing header, and a
 * per-route decorator is a rule that has to be remembered on every route added
 * from now on. This is the same argument `AuthGuard` makes for being global
 * and `@Public()` being the exception.
 *
 * ## Why it keys on `@Public()` and not on the presence of a session
 *
 * `@Public()` is a STATIC property of the route, so the answer does not change
 * with who is asking. Keying on `request.user` would make the same URL
 * cacheable for an anonymous visitor and not for a signed-in one, which is
 * precisely the shape that poisons a shared cache: the anonymous response gets
 * stored, and the next signed-in student is served it.
 *
 * Public routes are left completely alone rather than given a positive
 * directive — `/api/catalog/*` is deliberately cached at the edge, and the
 * rules for it live in `next.config.ts` and Cloudflare, not here.
 *
 * ## Why `no-store` and not `no-cache`
 *
 * `no-cache` permits storing the response and revalidating; `no-store` forbids
 * writing it down at all. For a payload containing one named minor's phone
 * number and exam scores, "may be written to disk on any intermediary as long
 * as it is revalidated" is not the guarantee worth having.
 *
 * An existing header is never overwritten, so a route that has thought about
 * its own caching keeps whatever it set.
 */
@Injectable()
export class PrivateCacheInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!isPublic) {
      const response = context.switchToHttp().getResponse<ResponseLike>();
      // Set BEFORE `next.handle()`. Headers must be on the response object
      // before the handler's value is serialised and flushed; doing this in a
      // `tap` after the fact races the write for any streamed response.
      if (!response.getHeader('cache-control')) {
        response.setHeader('cache-control', 'private, no-store');
        // Belt and braces for a shared cache that keys on the URL alone: tell
        // it the response varies by credentials, so even a cache that ignores
        // `no-store` cannot serve one student's row to another.
        if (!response.getHeader('vary')) response.setHeader('vary', 'Cookie');
      }
    }

    return next.handle();
  }
}
