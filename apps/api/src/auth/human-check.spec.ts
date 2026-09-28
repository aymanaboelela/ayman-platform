import { createTurnstileCheck } from './human-check';

function fakeFetch(respond: () => Promise<Response>) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return respond();
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

describe('createTurnstileCheck', () => {
  it('passes a token Cloudflare accepts, and sends the secret and the client address', async () => {
    const { impl, calls } = fakeFetch(() => json({ success: true }));
    const check = createTurnstileCheck('the-secret', impl);

    await expect(check.verify('tok', '41.35.1.2')).resolves.toBe(true);
    expect(calls[0]?.url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(calls[0]?.body).toEqual({ secret: 'the-secret', response: 'tok', remoteip: '41.35.1.2' });
  });

  it('refuses a token Cloudflare rejects', async () => {
    const { impl } = fakeFetch(() => json({ success: false, 'error-codes': ['timeout-or-duplicate'] }));
    await expect(createTurnstileCheck('s', impl).verify('tok', null)).resolves.toBe(false);
  });

  it('refuses a missing token without asking Cloudflare', async () => {
    const { impl, calls } = fakeFetch(() => json({ success: true }));
    const check = createTurnstileCheck('s', impl);
    await expect(check.verify(undefined, null)).resolves.toBe(false);
    await expect(check.verify('', null)).resolves.toBe(false);
    expect(calls).toHaveLength(0);
  });

  // Fail closed: an outage at Cloudflare must not turn the check off.
  it('refuses when siteverify errors or answers non-200', async () => {
    const down = fakeFetch(() => Promise.reject(new Error('ECONNRESET')));
    await expect(createTurnstileCheck('s', down.impl).verify('tok', null)).resolves.toBe(false);

    const broken = fakeFetch(() => json({ success: true }, 500));
    await expect(createTurnstileCheck('s', broken.impl).verify('tok', null)).resolves.toBe(false);
  });
});
