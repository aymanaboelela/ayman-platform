// @vitest-environment node
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UPSTREAM_TIMEOUT_DIGEST } from './api';
import {
  REPORTS_PER_MINUTE,
  buildServerErrorReport,
  reportServerError,
  resetServerReportCeiling,
  type ServerErrorContext,
  type ServerErrorRequest,
} from './report-server-error';

/**
 * The server half of `/admin/errors`: a Server Component that throws is filed
 * with its REAL message, under the fingerprint the browser's report used to
 * get — kind, pathname, digest — so the two land on one row.
 */

const request = (overrides: Partial<ServerErrorRequest> = {}): ServerErrorRequest => ({
  path: '/quizzes/01a12fb3-5269-7487-9f88-ee821538579f?_rsc=1x2y',
  method: 'GET',
  headers: {
    cookie: '__Host-session_token=abc',
    'user-agent': 'Mozilla/5.0 (Linux; Android 10; K)',
    'cf-connecting-ip': '41.33.0.7',
  },
  ...overrides,
});

const context: ServerErrorContext = {
  routerKind: 'App Router',
  routePath: '/quizzes/[lessonId]',
  routeType: 'render',
  renderSource: 'react-server-components',
} as ServerErrorContext;

const thrown = (message: string, digest?: string) => Object.assign(new Error(message), { digest });

describe('buildServerErrorReport', () => {
  it('files the real message and stack under the digest the student was shown', () => {
    const report = buildServerErrorReport(
      thrown('/api/quiz/lessons/01a12fb3 failed with 429', '1389995574'),
      request(),
      context,
    );

    expect(report).toMatchObject({
      kind: 'server',
      message: '/api/quiz/lessons/01a12fb3 failed with 429',
      digest: '1389995574',
    });
    // Where in Next it happened, first — the pathname says which page, this
    // says which file.
    expect(report!.stack).toMatch(/^\[render · \/quizzes\/\[lessonId\] · react-server-components · GET\]\n/);
  });

  it('keeps the pathname and drops the query — which can carry a reset token', () => {
    const report = buildServerErrorReport(
      thrown('boom', '1'),
      request({ path: '/reset-password?token=secret&_rsc=1' }),
      context,
    );
    expect(report!.route).toBe('/reset-password');
    expect(JSON.stringify(report)).not.toContain('secret');
  });

  it('files an API that did not answer as a timeout, the kind the admin screen explains', () => {
    const report = buildServerErrorReport(thrown('/api/x failed with 503', UPSTREAM_TIMEOUT_DIGEST), request(), context);
    expect(report!.kind).toBe('timeout');
  });

  it('carries the cause, which is where undici puts the useful half of «fetch failed»', () => {
    const error = new TypeError('fetch failed', {
      cause: Object.assign(new Error('connect ECONNREFUSED 10.0.1.4:3300'), { code: 'ECONNREFUSED' }),
    });
    const report = buildServerErrorReport(error, request(), context);
    expect(report!.stack).toContain('Caused by: ECONNREFUSED connect ECONNREFUSED 10.0.1.4:3300');
  });

  it('never files Next’s own control flow, or a visitor who closed the tab', () => {
    expect(buildServerErrorReport(thrown('x', 'NEXT_REDIRECT;replace;/login;307;'), request(), context)).toBeNull();
    expect(buildServerErrorReport(thrown('x', 'NEXT_HTTP_ERROR_FALLBACK;404'), request(), context)).toBeNull();
    const aborted = new Error('aborted');
    aborted.name = 'AbortError';
    expect(buildServerErrorReport(aborted, request(), context)).toBeNull();
  });

  it('copes with something that is not an Error being thrown', () => {
    expect(buildServerErrorReport('plain string', request(), context)!.message).toBe('plain string');
    expect(buildServerErrorReport({ odd: true }, request(), context)!.message).toBe(
      'A non-Error value was thrown',
    );
  });

  it('stays inside the bounds the public endpoint enforces', () => {
    const report = buildServerErrorReport(thrown('m'.repeat(5_000), 'd'.repeat(500)), request(), context)!;
    expect(report.message.length).toBeLessThanOrEqual(1000);
    expect(report.digest!.length).toBeLessThanOrEqual(200);
    expect(report.stack!.length).toBeLessThanOrEqual(4000);
  });
});

describe('reportServerError', () => {
  beforeEach(() => {
    resetServerReportCeiling();
    vi.unstubAllEnvs();
  });

  it('posts to the API with the visitor’s session, device and address', () => {
    const transport = vi.fn();
    reportServerError(thrown('boom', '42'), request(), context, transport);

    expect(transport).toHaveBeenCalledTimes(1);
    const [url, headers, body] = transport.mock.calls[0] as [URL, Record<string, string>, string];
    expect(url.pathname).toBe('/api/errors');
    // WHO hit it (the API reads the session), which device, and that
    // visitor's own throttle bucket rather than one shared by every page.
    expect(headers.cookie).toBe('__Host-session_token=abc');
    expect(headers['user-agent']).toContain('Android');
    expect(headers['cf-connecting-ip']).toBe('41.33.0.7');
    expect(JSON.parse(body)).toMatchObject({ kind: 'server', route: expect.stringMatching(/^\/quizzes\//), digest: '42' });
  });

  it('sends nothing while `next build` prerenders — there is no API to tell', () => {
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    const transport = vi.fn();
    reportServerError(thrown('boom', '42'), request(), context, transport);
    expect(transport).not.toHaveBeenCalled();
  });

  it('stops adding load to an outage once the per-minute ceiling is reached', () => {
    vi.useFakeTimers();
    try {
      const transport = vi.fn();
      for (let i = 0; i < REPORTS_PER_MINUTE + 25; i += 1) {
        reportServerError(thrown('API down', '7'), request(), context, transport);
      }
      expect(transport).toHaveBeenCalledTimes(REPORTS_PER_MINUTE);

      vi.advanceTimersByTime(60_000);
      reportServerError(thrown('API down', '7'), request(), context, transport);
      expect(transport).toHaveBeenCalledTimes(REPORTS_PER_MINUTE + 1);
    } finally {
      vi.useRealTimers();
    }
  });
});

/*
 * The real transport, against a real socket: it delivers, it does not wait
 * for the answer, and an API that is down costs nothing but a swallowed error.
 */
describe('reportServerError over node:http', () => {
  let server: Server | null = null;

  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = null;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function freshModule(origin: string) {
    vi.stubEnv('API_ORIGIN', origin);
    vi.resetModules();
    return import('./report-server-error');
  }

  it('delivers the report and returns before the API has answered', async () => {
    const received: { body: string; request: IncomingMessage }[] = [];
    let release: () => void = () => {};
    const answered = new Promise<void>((resolve) => (release = resolve));
    server = createServer((incoming, outgoing) => {
      let body = '';
      incoming.on('data', (chunk) => (body += chunk));
      incoming.on('end', () => {
        received.push({ body, request: incoming });
        // Held open: the reporter must not have been waiting on this.
        void answered.then(() => outgoing.writeHead(204).end());
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    const { reportServerError: report } = await freshModule(`http://127.0.0.1:${port}`);
    const returned = report(thrown('/api/me/mistakes failed with 500', '965715696'), request(), context);
    expect(returned).toBeUndefined();

    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]!.request.method).toBe('POST');
    expect(received[0]!.request.url).toBe('/api/errors');
    expect(received[0]!.request.headers['content-type']).toBe('application/json');
    expect(JSON.parse(received[0]!.body)).toMatchObject({
      kind: 'server',
      message: '/api/me/mistakes failed with 500',
      digest: '965715696',
    });
    release();
  });

  it('swallows an API that is not there at all', async () => {
    // Bind and release a port, so nothing is listening on it.
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const { port } = probe.address() as AddressInfo;
    await new Promise<void>((resolve) => probe.close(() => resolve()));

    const { reportServerError: report } = await freshModule(`http://127.0.0.1:${port}`);
    const unhandled = vi.fn();
    process.on('uncaughtException', unhandled);
    try {
      expect(() => report(thrown('boom', '1'), request(), context)).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('uncaughtException', unhandled);
    }
  });
});
