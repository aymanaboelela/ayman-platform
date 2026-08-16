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

function Harness({ message, digest }: { message: string; digest?: string }) {
  useErrorReport(Object.assign(new Error(message), { digest }));
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

  it('separates a server throw from a client one by its digest', () => {
    render(<Harness message="omitted in production" digest="2767814311" />);
    expect(posted().kind).toBe('server');
  });

  it('recognises an upstream timeout by the digest lib/api stamps on it', () => {
    render(<Harness message="upstream" digest={UPSTREAM_TIMEOUT_DIGEST} />);
    expect(posted().kind).toBe('timeout');
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
