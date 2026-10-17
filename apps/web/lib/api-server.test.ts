// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { UPSTREAM_BUSY_DIGEST } from './upstream-digest';

vi.mock('next/headers', () => ({
  cookies: async () => ({ toString: () => '__Host-session_token=abc', get: () => undefined }),
  headers: async () => new Headers(),
}));

const { ApiSendError, apiSend, refusalReason } = await import('./api-server');

afterEach(() => {
  vi.unstubAllGlobals();
});

const refusal = (status: number, body: Record<string, unknown>) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('apiSend failures', () => {
  it('carries the status and the parsed body, keeping the message callers match on', async () => {
    vi.stubGlobal(
      'fetch',
      refusal(403, {
        statusCode: 403,
        message: 'Forbidden',
        code: 'quiz_closed',
        details: { openUntil: '2026-10-14T17:00:00.000Z' },
        requestId: 'r-1',
        timestamp: '2026-10-14T17:01:10.811Z',
      }),
    );

    const error = (await apiSend('POST', '/api/quiz/attempts/a1/resume', z.unknown()).catch(
      (caught: unknown) => caught,
    )) as InstanceType<typeof ApiSendError>;

    expect(error).toBeInstanceOf(ApiSendError);
    expect(error.status).toBe(403);
    expect(refusalReason(error.payload)).toBe('quiz_closed');
    expect(error.message).toContain('failed with 403');
  });

  it('leaves the request’s own id and time out of the message, so one failure is one digest', async () => {
    // Next hashes the message into the digest `/admin/errors` groups on. With
    // a fresh `requestId` in it, one student's closed paper filed five rows in
    // sixteen seconds.
    const body = { statusCode: 403, message: 'Forbidden', code: 'quiz_closed' };
    const messages: string[] = [];
    for (const requestId of ['r-1', 'r-2']) {
      vi.stubGlobal('fetch', refusal(403, { ...body, requestId, timestamp: new Date().toISOString() }));
      const error = (await apiSend('POST', '/api/quiz/attempts/a1/resume', z.unknown()).catch(
        (caught: unknown) => caught,
      )) as Error;
      messages.push(error.message);
    }

    expect(messages[0]).toBe(messages[1]);
    expect(messages[0]).not.toContain('r-1');
  });

  it('marks a throttle so the exam runner’s page waits it out by itself', async () => {
    vi.stubGlobal('fetch', refusal(429, { statusCode: 429, message: 'ThrottlerException: Too Many Requests' }));
    const error = (await apiSend('POST', '/api/quiz/attempts/a1/resume', z.unknown()).catch(
      (caught: unknown) => caught,
    )) as Error & { digest?: string };
    expect(error.digest).toBe(UPSTREAM_BUSY_DIGEST);
  });
});

describe('refusalReason', () => {
  it('reads `code` first, then a bare machine-readable `message`', () => {
    expect(refusalReason({ code: 'quiz_not_open_yet', message: 'Forbidden' })).toBe('quiz_not_open_yet');
    expect(refusalReason({ statusCode: 403, message: 'needs_month_grant' })).toBe('needs_month_grant');
  });

  it('says nothing for a human sentence or a body that is not one', () => {
    expect(refusalReason({ message: 'Forbidden resource' })).toBeNull();
    expect(refusalReason(undefined)).toBeNull();
    expect(refusalReason('expired')).toBeNull();
  });
});
