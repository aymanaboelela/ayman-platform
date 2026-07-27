import { Observable, of, lastValueFrom } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { AuditContextInterceptor } from './audit-context.interceptor';
import { currentActor, runWithActor } from './audit-context';

function httpContext(request: unknown): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('audit context', () => {
  it('reads as all-nulls outside a request', () => {
    expect(currentActor()).toEqual({
      actorUserId: null,
      actorIp: null,
      actorUserAgent: null,
      requestId: null,
    });
  });

  it('exposes the actor to code running beneath runWithActor', () => {
    runWithActor(
      { actorUserId: 'u1', actorIp: '10.0.0.1', actorUserAgent: 'ua', requestId: 'r1' },
      () => {
        expect(currentActor().actorUserId).toBe('u1');
      },
    );
    // …and restores the empty actor on the way out.
    expect(currentActor().actorUserId).toBeNull();
  });

  /**
   * The regression this file exists for: `next.handle()` is deferred, so the
   * handler runs on SUBSCRIBE. An interceptor that returns
   * `run(actor, () => next.handle())` type-checks and records a null actor for
   * every write in the product.
   */
  it('the actor is visible inside the deferred handler, not just at intercept time', async () => {
    const interceptor = new AuditContextInterceptor();
    let seen: string | null = 'not-run';

    const next: CallHandler = {
      handle: () =>
        // This body runs on subscribe, exactly like a real route handler.
        new Observable((subscriber) => {
          seen = currentActor().actorUserId;
          subscriber.next('ok');
          subscriber.complete();
        }),
    };

    const context = httpContext({
      user: { id: 'admin_1' },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
    });

    await lastValueFrom(interceptor.intercept(context, next));
    expect(seen).toBe('admin_1');
  });

  it('passes non-http contexts straight through', async () => {
    const interceptor = new AuditContextInterceptor();
    const context = { getType: () => 'rpc' } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of('through') };
    await expect(lastValueFrom(interceptor.intercept(context, next))).resolves.toBe('through');
  });
});
