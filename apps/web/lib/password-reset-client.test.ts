import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmReset, requestResetCode } from './password-reset-client';

function respond(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestResetCode', () => {
  it('sends the number, the CSRF header and the Turnstile token', async () => {
    const fetchMock = respond(200, { status: 'accepted', handle: 'h'.repeat(43) });
    await expect(requestResetCode('+201012345678', 'tok')).resolves.toEqual({ kind: 'accepted', handle: 'h'.repeat(43) });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/password-reset/request');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-csrf-token']).toBeTruthy();
    expect(headers['x-captcha-response']).toBe('tok');
    expect(JSON.parse(String(init.body))).toEqual({ phoneNumber: '+201012345678' });
  });

  it('treats an `accepted` with no handle as a failure — the next step could never succeed', async () => {
    respond(200, { status: 'accepted' });
    await expect(requestResetCode('+201012345678', null)).resolves.toEqual({ kind: 'failed' });
  });

  it('reads `unavailable` as a fact about the stack', async () => {
    respond(200, { status: 'unavailable' });
    await expect(requestResetCode('+201012345678', null)).resolves.toEqual({ kind: 'unavailable' });
  });

  it('reads a 429 as a limit, with its wait', async () => {
    respond(429, { code: 'PASSWORD_RESET_LIMITED', details: { retryAfterSeconds: 42 } });
    await expect(requestResetCode('+201012345678', null)).resolves.toEqual({ kind: 'limited', retryAfterSeconds: 42 });
  });

  it('collapses anything unnamed to `failed` — it never reads the message', async () => {
    respond(500, { message: 'some library string' });
    await expect(requestResetCode('+201012345678', null)).resolves.toEqual({ kind: 'failed' });
  });
});

describe('confirmReset', () => {
  it('passes `reset` and `google` through', async () => {
    respond(200, { status: 'reset' });
    await expect(confirmReset({ phoneNumber: '+201012345678', handle: 'h'.repeat(43), code: '123456', newPassword: 'x'.repeat(8) })).resolves.toEqual({ kind: 'reset' });
    respond(200, { status: 'google' });
    await expect(confirmReset({ phoneNumber: '+201012345678', handle: 'h'.repeat(43), code: '123456', newPassword: 'x'.repeat(8) })).resolves.toEqual({ kind: 'google' });
  });

  it('reads the one refusal code as `invalid`', async () => {
    respond(400, { code: 'PASSWORD_RESET_INVALID_CODE' });
    await expect(confirmReset({ phoneNumber: '+201012345678', handle: 'h'.repeat(43), code: '123456', newPassword: 'x'.repeat(8) })).resolves.toEqual({ kind: 'invalid' });
  });
});
