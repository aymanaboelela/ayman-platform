// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, UPSTREAM_TIMEOUT_DIGEST, apiFetch, burstRetryDelayMs } from './api';
import { UPSTREAM_BUSY_DIGEST } from './upstream-digest';

/**
 * The two bits a SERVER failure carries to the error boundary in production,
 * where the message does not survive: "the API throttled us" and "the API did
 * not answer". Each lets the boundary wait the failure out by itself instead
 * of stranding a student behind a button (`lib/auto-retry.ts`).
 *
 * The node environment on purpose: both are server-side behaviours, and the
 * second is deliberately switched OFF wherever `window` exists.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ApiRequestError', () => {
  it('marks a throttle refusal so the boundary can tell it from a fault', () => {
    expect(new ApiRequestError(429, '/api/quiz/lessons/x').digest).toBe(UPSTREAM_BUSY_DIGEST);
  });

  it('leaves every other status to Next’s own digest', () => {
    for (const status of [400, 401, 403, 404, 409, 500, 503]) {
      expect(new ApiRequestError(status, '/api/x').digest, String(status)).toBeUndefined();
    }
  });
});

describe('apiFetch on the server', () => {
  it('files a refused connection — a deploy restarting the API — as «did not answer»', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(
        new TypeError('fetch failed', { cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }) }),
      ),
    );

    const error = await apiFetch('/api/me/dashboard').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).status).toBe(503);
    expect((error as ApiRequestError).digest).toBe(UPSTREAM_TIMEOUT_DIGEST);
  });

  it('still reports a timeout the way it always did', async () => {
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout));

    const error = (await apiFetch('/api/x').catch((caught: unknown) => caught)) as ApiRequestError;
    expect(error.status).toBe(504);
    expect(error.digest).toBe(UPSTREAM_TIMEOUT_DIGEST);
  });

  it('keeps a programming error’s own message — a bad URL is a bug, not an outage', async () => {
    const malformed = new TypeError('Failed to parse URL from http://[::1');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(malformed));

    await expect(apiFetch('/api/x')).rejects.toBe(malformed);
  });
});

describe('a burst 429 on the server gets one retry', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const throttled = (headers: Record<string, string>) => new Response('{}', { status: 429, headers });

  it('reads the longest refusing window, and only a short one', () => {
    expect(burstRetryDelayMs(new Headers({ 'retry-after-short': '1' }))).toBe(1100);
    expect(burstRetryDelayMs(new Headers({ 'retry-after-short': '1', 'retry-after-medium': '40' }))).toBeNull();
    expect(burstRetryDelayMs(new Headers({ 'retry-after': '2' }))).toBe(2100);
    expect(burstRetryDelayMs(new Headers({ 'retry-after-short': 'soon' }))).toBeNull();
    expect(burstRetryDelayMs(new Headers())).toBeNull();
  });

  it('waits out a short-window refusal and returns the retry’s answer', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(throttled({ 'retry-after-short': '1' }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const pending = apiFetch('/api/me/league');
    await vi.advanceTimersByTimeAsync(1100);
    const response = await pending;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not hold a render for a long window, nor repeat a write', async () => {
    const fetchMock = vi.fn().mockResolvedValue(throttled({ 'retry-after-medium': '30' }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await apiFetch('/api/session')).status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(throttled({ 'retry-after-short': '1' }));
    expect((await apiFetch('/api/me/notes', { method: 'POST', body: '{}' })).status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
