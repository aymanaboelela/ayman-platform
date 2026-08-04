import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// `admin-api.ts` reads the incoming request's cookies for the CSRF
// double-submit value. Neither helper's behaviour under test depends on what
// that value is — only that reading it does not explode outside a request.
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ cookie: '__Host-csrf=token' }),
}));

const { adminSend, adminSendVoid } = await import('./admin-api');

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A `204 No Content` exactly as Nest sends it: ok, and no body at all. */
function stubNoContent() {
  const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchSpy);
  return fetchSpy;
}

describe('adminSendVoid', () => {
  it('resolves on a 204, where adminSend throws on the empty body', async () => {
    /*
     * THE regression. `adminSend` ends with `schema.parse(await
     * response.json())`, and `.json()` on an empty body throws `SyntaxError` —
     * AFTER the API has already done the work. المساعد's reply route shipped
     * that way, so pressing «ابعت الرد» wrote the reply, notified the student,
     * and then told the instructor it had failed and kept his text in the box.
     *
     * Both halves are asserted together on purpose: the point is not that one
     * helper works, it is that the two behave DIFFERENTLY on the same response
     * and the caller has to pick the right one.
     */
    stubNoContent();
    await expect(adminSendVoid('POST', '/api/admin/conversations/x/reply', { message: 'hi' }))
      .resolves.toBeUndefined();

    stubNoContent();
    await expect(
      adminSend('POST', '/api/admin/conversations/x/reply', { message: 'hi' }, z.unknown()),
    ).rejects.toThrow(SyntaxError);
  });

  it('does not read the body at all', async () => {
    // Not merely "tolerates an empty body" — it never asks for one. A helper
    // that parsed opportunistically would still couple this route to a shape
    // the API does not promise.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const response = new Response(null, { status: 204 });
        response.json = () => {
          throw new Error('body must not be read on a 204 route');
        };
        return response;
      }),
    );
    await expect(adminSendVoid('PATCH', '/api/admin/conversations/x/status', { status: 'closed' }))
      .resolves.toBeUndefined();
  });

  it('sends the CSRF header, the method and the body', async () => {
    const fetchSpy = stubNoContent();
    await adminSendVoid('POST', '/api/admin/conversations/x/reply', { message: 'مرحبا' });

    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ message: 'مرحبا' }));
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('token');
  });

  it('omits the body entirely when there is none', async () => {
    // `JSON.stringify(undefined)` is `undefined`, not `"null"` — but only
    // because the helper checks. Sending the string "null" to a `.strict()`
    // Zod DTO is a 400 that reads like a client bug.
    const fetchSpy = stubNoContent();
    await adminSendVoid('DELETE', '/api/admin/conversations/x');

    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toBeUndefined();
  });

  it('throws with the status and the server’s own words on a failure', async () => {
    // A silent failure here is what the whole bug was. The message has to name
    // the status, or "it did not send" is all anyone can report.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Forbidden', { status: 403 })),
    );
    await expect(
      adminSendVoid('POST', '/api/admin/conversations/x/reply', { message: 'hi' }),
    ).rejects.toThrow(/403/);
  });
});
