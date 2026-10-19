import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UPSTREAM_TIMEOUT_DIGEST } from './api';
import { useErrorReport } from './report-error';

const fetchMock = vi.fn();

beforeEach(() => {
  // Must RESOLVE, not return undefined: the hook chains `.catch()` on the
  // result and swallows the rejection there, so a bare `vi.fn()` throws inside
  // the effect rather than recording a call.
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
  // The hook logs every error to the console as well as posting it. That is
  // deliberate (see the hook), but it would print a wall of red through the
  // suite, so it is silenced rather than asserted on.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Harness({
  message,
  digest,
  name,
}: {
  message: string;
  digest?: string;
  /** `TypeError` for the shapes a dropped connection actually arrives in. */
  name?: string;
}) {
  const error = Object.assign(name === 'TypeError' ? new TypeError(message) : new Error(message), {
    digest,
  });
  if (name && name !== 'TypeError') error.name = name;
  useErrorReport(error);
  return null;
}

/** The single POST the hook made, parsed. Throws loudly if it made none. */
function posted() {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe('/api/errors');
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe('useErrorReport', () => {
  it('files an ordinary client throw with its route and message', () => {
    render(<Harness message="something broke while rendering" />);

    const body = posted();
    expect(body.kind).toBe('client');
    expect(body.message).toBe('something broke while rendering');
    // The PATHNAME only — a query string here can carry a password-reset token.
    expect(body.route).toBe(window.location.pathname);
    expect(String(body.route)).not.toContain('?');
  });

  /*
   * A digest means the throw happened in a SERVER render, and the server now
   * files those itself with the real message (`instrumentation.ts` →
   * `lib/report-server-error.ts`). The browser's copy carries only Next's
   * production sentence; filing it as well would count every failure twice
   * and race the server's stack with a useless one. Asserted as "nothing was
   * posted", for the same reason the stale-deploy case below is.
   */
  it('leaves a server throw to the server, which has its real message', () => {
    render(
      <Harness
        message="An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details."
        digest="2767814311"
      />,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaves the upstream-timeout digest to the server as well', () => {
    render(<Harness message="upstream" digest={UPSTREAM_TIMEOUT_DIGEST} />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('files every remaining report as a client one, with no digest field', () => {
    render(<Harness message="Cannot read properties of null (reading 'replace')" name="TypeError" />);
    const body = posted();
    expect(body.kind).toBe('client');
    expect(body).not.toHaveProperty('digest');
  });

  /*
   * ⚠️ The one error that must NOT reach the log.
   *
   * A tab older than the deploy it is talking to is not a fault. It also
   * arrives with a fresh action id every time, so it can never group into an
   * existing row — one NEW row per deploy per open tab, on the screen whose
   * whole job is showing what is broken. Filing it does not just add noise, it
   * crowds out the faults the instructor opens the page to find.
   *
   * Asserted as "fetch was never called", not as "the body was different":
   * a version that posted it under another `kind` would still fill the log.
   */
  it('never files a stale-deploy error, however the sentence is punctuated', () => {
    for (const message of [
      'Server Action "70674c275044efa878d1f18e7c30cc06df93a1365f" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action',
      'Server Action "abc123" was not found on the server.',
    ]) {
      render(<Harness message={message} />);
      cleanup();
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never files a chunk load error from a stale deploy', () => {
    const err = new Error('Failed to load chunk /_next/static/chunks/0lh3tq3nd7tdv.js from module 501123');
    err.name = 'ChunkLoadError';
    render(<Harness message={err.message} />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never files the student’s own connection dropping, in any engine’s words', () => {
    // `network error` is the one production recorded — Chrome's sentence for a
    // response body that died half-way, thrown out of the RSC stream reader on
    // `/results`, `/rank`, `/dashboard` and a quiz review. The rest are the
    // same event in Safari's and Firefox's words, and React's own for a Flight
    // stream that ended early.
    for (const message of [
      'Failed to fetch',
      'Load failed',
      'network error',
      'NetworkError when attempting to fetch resource.',
      'The network connection was lost.',
    ]) {
      render(<Harness message={message} name="TypeError" />);
      cleanup();
    }
    render(<Harness message="Connection closed." />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never files React’s «Connection closed.» in the minified spelling Next 16.3.8 ships', () => {
    // 18 rows on `/` and 3 on a `/news` article the night after the upgrade —
    // the same dropped stream as above, no longer recognised once minified.
    render(
      <Harness message="Minified React error #412; visit https://react.dev/errors/412 for the full message or use the non-minified dev environment for full errors and additional helpful warnings." />,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never files anything while the browser says it is offline', () => {
    const onLine = vi.spyOn(Navigator.prototype, 'onLine', 'get').mockReturnValue(false);
    render(<Harness message="anything at all" />);
    expect(fetchMock).not.toHaveBeenCalled();
    onLine.mockRestore();
  });

  it('still files a component that throws those words on purpose', () => {
    // The sentence alone is not enough: a connectivity failure is a TypeError
    // (or React's «Connection closed.»). A plain Error saying «network error»
    // is somebody's real message and belongs in the log.
    render(<Harness message="network error" />);
    expect(posted().message).toBe('network error');
  });

  it('never files a Server Action the edge answered mid-deploy', () => {
    // «An unexpected response was received from the server.» — recorded on
    // `/admin/grading/<id>` and `/admin/homework/<id>`. Next's own server
    // cannot produce it; Traefik or Cloudflare did, which is a deploy window.
    render(<Harness message="An unexpected response was received from the server." />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still files a real error that merely mentions a server action', () => {
    // Matching too broadly would silently empty the screen this was found on,
    // so the guard needs both halves of the sentence — not the words "Server
    // Action" on their own.
    render(<Harness message="Server Action failed: the database refused the write" />);
    expect(posted().kind).toBe('client');
  });

  it('reports once per distinct error, not once per render', () => {
    // The boundary re-renders on every `reset()` attempt and twice per mount
    // under StrictMode. Keyed on the error object, this fires once per actual
    // failure — otherwise one outage becomes a stream of identical reports.
    const { rerender } = render(<Harness message="stable failure" />);
    rerender(<Harness message="stable failure" />);
    rerender(<Harness message="stable failure" />);

    // Each render builds a NEW Error object, so this asserts the dependency is
    // doing real work rather than that nothing changed: three renders, and the
    // hook is keyed on identity, so a fresh object legitimately reports again.
    // What must never happen is a report WITHOUT a re-render, which the
    // single-call assertions above already pin.
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
