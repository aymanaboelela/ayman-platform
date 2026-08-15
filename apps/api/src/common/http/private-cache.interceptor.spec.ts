import { of } from 'rxjs';
import { PrivateCacheInterceptor } from './private-cache.interceptor';

/**
 * The header that was missing entirely.
 *
 * Written against the interceptor directly rather than through a Nest test
 * module: the whole behaviour is "what does it put on the response object, and
 * when", and a real HTTP round trip would test Express's header handling
 * instead.
 */
function makeContext(isPublic: boolean, existing: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...existing };
  const response = {
    setHeader: jest.fn((name: string, value: string) => {
      headers[name.toLowerCase()] = value;
    }),
    getHeader: jest.fn((name: string) => headers[name.toLowerCase()]),
  };
  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getResponse: () => response }),
  };
  const reflector = { getAllAndOverride: jest.fn(() => isPublic) };
  return { context, response, reflector, headers };
}

const handler = { handle: jest.fn(() => of('body')) };

describe('PrivateCacheInterceptor', () => {
  beforeEach(() => handler.handle.mockClear());

  it('marks an authenticated response private and unstorable', async () => {
    const { context, reflector, headers } = makeContext(false);
    const interceptor = new PrivateCacheInterceptor(reflector as never);

    interceptor.intercept(context as never, handler as never);

    expect(headers['cache-control']).toBe('private, no-store');
  });

  it('varies on Cookie, so a URL-keyed shared cache cannot cross students', async () => {
    const { context, reflector, headers } = makeContext(false);
    new PrivateCacheInterceptor(reflector as never).intercept(context as never, handler as never);

    expect(headers.vary).toBe('Cookie');
  });

  it('leaves a @Public() route completely alone', async () => {
    // `/api/catalog/*` is deliberately cacheable at the edge; the rules for it
    // live in next.config.ts and Cloudflare, not here. Writing ANY directive
    // would be this file quietly taking that decision over.
    const { context, response, reflector } = makeContext(true);
    new PrivateCacheInterceptor(reflector as never).intercept(context as never, handler as never);

    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it('does not overwrite a route that set its own cache-control', async () => {
    const { context, headers, reflector } = makeContext(false, {
      'cache-control': 'private, max-age=60',
    });
    new PrivateCacheInterceptor(reflector as never).intercept(context as never, handler as never);

    expect(headers['cache-control']).toBe('private, max-age=60');
  });

  it('sets the header BEFORE invoking the handler', async () => {
    // After the fact would race the write on any streamed response — the CSV
    // exports are exactly that shape.
    const order: string[] = [];
    const { context, reflector } = makeContext(false);
    const response = context.switchToHttp().getResponse();
    (response.setHeader as jest.Mock).mockImplementation(() => order.push('header'));
    const late = { handle: jest.fn(() => { order.push('handler'); return of('body'); }) };

    new PrivateCacheInterceptor(reflector as never).intercept(context as never, late as never);

    // Two headers are written (cache-control and vary), so the invariant is
    // "every header precedes the handler", not a fixed array — spelling out
    // the exact sequence would break the next time a header is added, without
    // anything actually being wrong.
    expect(order).toContain('handler');
    expect(order.lastIndexOf('header')).toBeLessThan(order.indexOf('handler'));
  });

  it('still returns the handler’s stream untouched', async () => {
    const { context, reflector } = makeContext(false);
    const result = new PrivateCacheInterceptor(reflector as never).intercept(
      context as never,
      handler as never,
    );

    await expect(new Promise((r) => result.subscribe(r))).resolves.toBe('body');
  });
});
