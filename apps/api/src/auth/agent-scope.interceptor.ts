import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { ResolvedAgentToken } from './agent-token.resolver';
import { runWithAgentScope } from './permissions';

/**
 * Narrows every permission question about the key's creator to the key, for
 * the whole handler — see `runWithAgentScope` in `permissions.ts` for why the
 * guard's route check alone is not enough.
 *
 * An interceptor, not `enterWith` in the guard: wrapping `next.handle()` is
 * the shape `AuditContextInterceptor` already relies on to carry a context
 * through the handler's async chain, and it cannot leak into the next request
 * on the same socket.
 */
@Injectable()
export class AgentScopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const token = context.switchToHttp().getRequest<{ agentToken?: ResolvedAgentToken }>().agentToken;
    if (!token) return next.handle();

    const scope = { userId: token.user.id, permissions: token.permissions };
    return new Observable((subscriber) => runWithAgentScope(scope, () => next.handle().subscribe(subscriber)));
  }
}
