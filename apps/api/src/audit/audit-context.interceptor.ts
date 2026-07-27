import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { runWithActor, type AuditActor } from './audit-context';

interface AuditableRequest {
  ip?: string;
  id?: unknown;
  user?: AuthenticatedUser;
  headers?: Record<string, string | string[] | undefined>;
}

function firstHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Populates the ambient audit actor for the duration of one request.
 *
 * An interceptor rather than middleware because middleware runs *before*
 * `AuthGuard`, so `request.user` would still be undefined and every audit row
 * would carry a null actor. Interceptors run after guards.
 *
 * ⚠️ The subscription has to happen INSIDE `runWithActor`. `next.handle()`
 * returns a deferred Observable — the route handler executes on subscribe, and
 * if that subscribe happens after the `AsyncLocalStorage.run` scope has exited
 * the store is already gone. Returning `runWithActor(actor, () =>
 * next.handle())` compiles, type-checks, and silently records a null actor for
 * every write in the product.
 *
 * `request.ip` comes from Express's own resolution, which honours the hop
 * count set by `trust proxy` in main.ts. It is never read from a raw
 * `X-Forwarded-For`, which the client controls.
 */
@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<AuditableRequest>();
    const actor: AuditActor = {
      actorUserId: request.user?.id ?? null,
      actorIp: request.ip ?? null,
      actorUserAgent: firstHeader(request.headers?.['user-agent']),
      requestId: typeof request.id === 'string' ? request.id : null,
    };

    return new Observable((subscriber) =>
      runWithActor(actor, () => next.handle().subscribe(subscriber)),
    );
  }
}
