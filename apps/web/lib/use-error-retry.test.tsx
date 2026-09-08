import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouter } from 'next/navigation';
import { useErrorRetry } from './use-error-retry';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

const refresh = vi.fn();
const reload = vi.fn();

beforeEach(() => {
  vi.mocked(useRouter).mockReturnValue({ refresh } as unknown as ReturnType<typeof useRouter>);
  // jsdom's `location.reload` is not configurable in place, so the whole
  // accessor is replaced. `vi.unstubAllGlobals` in `afterEach` puts it back.
  vi.stubGlobal('location', { ...window.location, reload });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

/**
 * The order of the two calls is the whole fix, so the harness records it
 * rather than asserting on each in isolation — `reset()` before
 * `router.refresh()` is exactly the broken behaviour this file exists to
 * prevent, and two independent `toHaveBeenCalled` assertions pass on it.
 */
function Harness({
  digest,
  message = 'boom',
  name,
}: {
  digest?: string;
  message?: string;
  /** `ChunkLoadError` — the only thing `isStaleChunkError` looks at. */
  name?: string;
}) {
  const error = Object.assign(new Error(message), { digest });
  if (name) error.name = name;
  const { retry, retrying } = useErrorRetry(error, () => calls.push('reset'));
  return (
    <button type="button" onClick={retry} disabled={retrying}>
      retry
    </button>
  );
}

let calls: string[] = [];

beforeEach(() => {
  calls = [];
  refresh.mockImplementation(() => calls.push('refresh'));
});

const press = () => fireEvent.click(screen.getByRole('button', { name: 'retry' }));

describe('useErrorRetry', () => {
  it('refreshes the router BEFORE resetting the boundary', () => {
    // The bug: `reset()` alone re-renders against the cached RSC payload and
    // reproduces the same throw, so the press does nothing visible. Only
    // `router.refresh()` invalidates that cache, and it has to happen first —
    // otherwise the reset renders the stale tree before the refresh lands.
    render(<Harness digest="first-failure" />);
    press();

    expect(calls).toEqual(['refresh', 'reset']);
    expect(reload).not.toHaveBeenCalled();
  });

  it('escalates a second press on the SAME failure to a document load', () => {
    // A refresh cannot fix a client module that failed to evaluate — the
    // broken module graph is still in memory. Only a document load replaces it.
    render(<Harness digest="repeated-failure" />);

    press();
    expect(calls).toEqual(['refresh', 'reset']);
    expect(reload).not.toHaveBeenCalled();

    press();
    expect(reload).toHaveBeenCalledTimes(1);
    // The second press must NOT also refresh/reset — it is a different action,
    // not an additional one.
    expect(calls).toEqual(['refresh', 'reset']);
  });

  it('gives a different failure its own first press', () => {
    // The counter is module-scoped so it survives the boundary remounting. That
    // is deliberate, and this is the risk it carries: a later, unrelated error
    // must not inherit a strike and hard-reload on its first press.
    render(<Harness digest="failure-a" />);
    press();
    press();
    expect(reload).toHaveBeenCalledTimes(1);

    cleanup();
    reload.mockClear();
    calls = [];

    render(<Harness digest="failure-b" />);
    press();

    expect(calls).toEqual(['refresh', 'reset']);
    expect(reload).not.toHaveBeenCalled();
  });

  /*
   * The stale-deploy branch, which is the one case where the FIRST press must
   * skip straight to a document load.
   *
   * A tab open across a deploy holds Server Action ids from a build the server
   * no longer has. `router.refresh()` re-fetches the RSC payload and leaves the
   * loaded client bundle — where the stale id lives — so the normal first press
   * is guaranteed to do nothing, and the editor only recovers on the second.
   * Measured on production as `/admin/errors` row 17.
   *
   * These assert the ABSENCE of the refresh as hard as the presence of the
   * reload: a version that reloaded *and* refreshed would look fixed by a
   * `toHaveBeenCalled` check while still doing the useless work first.
   */
  it('reloads on the FIRST press when the tab is older than the deploy', () => {
    render(
      <Harness message={'Server Action "70674c2750" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action'} />,
    );
    press();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });

  it('does not let a stale-deploy press spend the strike of a later error', () => {
    // The stale branch returns before the module-scoped counter is touched. If
    // it fell through instead, the next unrelated failure would arrive already
    // holding a strike and hard-reload on its own first press — the exact bug
    // the `failure-a`/`failure-b` case above guards.
    render(
      <Harness message={'Server Action "abc" was not found on the server. '} />,
    );
    press();
    expect(reload).toHaveBeenCalledTimes(1);

    cleanup();
    reload.mockClear();
    calls = [];

    render(<Harness digest="an-ordinary-server-error" />);
    press();

    expect(calls).toEqual(['refresh', 'reset']);
    expect(reload).not.toHaveBeenCalled();
  });

  /**
   * A chunk that is not on the server any more — the failure `public/sw.js`
   * versioning its cache per build makes reachable, and the one nobody can
   * press their way out of.
   *
   * The hook asks the server before acting, so every case here says what the
   * re-request answered. That is the whole point: `ChunkLoadError` is also what
   * a dropped connection raises, and the two need opposite treatment.
   */
  describe('a chunk that would not load', () => {
    const CHUNK = 'Failed to load chunk /_next/static/chunks/a.js from module 44811';

    function chunk(message = CHUNK) {
      return <Harness name="ChunkLoadError" message={message} />;
    }

    beforeEach(() => {
      window.sessionStorage.clear();
    });

    it('reloads when the file is gone and the origin is healthy', async () => {
      // 404 on the chunk, but the page the student is on still serves — so the
      // backend is up and this really is a tab older than the server.
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({ status: 404 }).mockResolvedValueOnce({ ok: true }),
      );

      render(chunk());

      await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1), { timeout: 4000 });
    });

    it('does NOT reload into a deploy window, and does not spend the mark', async () => {
      // The runbook's own «الـ 404 لثواني وقت النشر طبيعي». Everything 404s for
      // those seconds, so reloading lands on a bare 404 — `sw.js` passes a
      // served error straight through — with the one recovery already gone.
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({ status: 404 }).mockResolvedValueOnce({ ok: false }),
      );

      render(chunk());

      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2), { timeout: 4000 });
      expect(reload).not.toHaveBeenCalled();
      // Unspent, so the recovery is still there once the new container is up.
      expect(window.sessionStorage.getItem('ayman:chunk-reload')).toBeNull();
    });

    it('does NOT take the page away when the network is the problem', async () => {
      // The case `navigator.onLine` could not see: online on paper, failing in
      // practice. A reload here makes `sw.js` serve the offline page and the
      // student loses what they were reading.
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      render(chunk());

      await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
      expect(reload).not.toHaveBeenCalled();
    });

    it('does not reload while the server is unwell', async () => {
      // A 5xx is not a deploy and not a blip; a document load asks the same
      // struggling server for a great deal more.
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 503 }));

      render(chunk());

      await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
      expect(reload).not.toHaveBeenCalled();
    });

    it('reloads when the file is there after all', async () => {
      // The first attempt was a blip; the bytes exist, so a document load
      // clears it.
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200 }));

      render(chunk());

      await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    });

    it('leaves the page alone when the URL cannot be recovered', async () => {
      // The URL is the one part of Turbopack's message that is not a stable
      // literal. Losing it must cost the automatic recovery, never the page.
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200 }));

      render(chunk('Failed to load chunk from an HMR update'));

      expect(fetch).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
    });

    it('does not let a blip spend the recovery a real deploy needs', async () => {
      // A 2xx probe means the file is there and the first attempt was a blip —
      // but that reload lands on the SAME build, so it must not write the mark
      // the 404 branch keys on. Otherwise one flaky moment ever costs the tab
      // its automatic recovery at the next genuine deploy.
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200 }));

      render(chunk());
      await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
      expect(window.sessionStorage.getItem('ayman:chunk-reload')).toBe('dev:blip');

      // Now the build really does move under this tab.
      cleanup();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({ status: 404 }).mockResolvedValueOnce({ ok: true }),
      );
      render(chunk('Failed to load chunk /_next/static/chunks/b.js from module 9'));

      await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(2), { timeout: 4000 });
      expect(window.sessionStorage.getItem('ayman:chunk-reload')).toBe('dev');
    });

    it('reloads once per BUILD, not once per tab', async () => {
      // A constant mark would spend the tab's only automatic recovery on the
      // first blip ever and strand it on the error screen at the next real
      // deploy. The mark is the build this tab is running.
      // 200 on the probe — the blip path, which needs no deploy-window check.
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200 }));

      render(chunk());
      await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

      // Same build still loaded — i.e. the reload changed nothing. Stop.
      cleanup();
      render(chunk('Failed to load chunk /_next/static/chunks/b.js from module 9'));
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      expect(reload).toHaveBeenCalledTimes(1);

      // A later deploy: this tab is now running a different build, so it gets
      // its own recovery rather than being stranded.
      cleanup();
      window.sessionStorage.setItem('ayman:chunk-reload', 'some-older-build');
      render(chunk());
      await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(2));
    });

    it('keeps its mark out of the module-eval slot', async () => {
      // Two classes sharing one key would let each reset the other's bound.
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200 }));

      render(chunk());

      await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
      expect(window.sessionStorage.getItem('ayman:module-eval-reload')).toBeNull();
    });

    it('does not spend a press on a refresh that cannot help', async () => {
      // Reached when the automatic reload was refused — offline, a 5xx, an
      // unrecoverable URL. Being ASKED is different from having it done to you,
      // and `router.refresh()` still cannot conjure a file the server did not
      // send.
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      render(chunk());
      await vi.waitFor(() => expect(fetch).toHaveBeenCalled());

      press();
      expect(reload).toHaveBeenCalledTimes(1);
      expect(calls).toEqual([]);
    });
  });

  it('falls back to the message when there is no digest', () => {
    // `digest` is absent for a client-side throw and in development, so the
    // message is the only identity available. Without a fallback both would key
    // on `undefined` and any two client errors would look like a repeat.
    render(<Harness message="client-side-a" />);
    press();
    expect(calls).toEqual(['refresh', 'reset']);

    cleanup();
    calls = [];

    render(<Harness message="client-side-b" />);
    press();

    expect(calls).toEqual(['refresh', 'reset']);
    expect(reload).not.toHaveBeenCalled();
  });
});
